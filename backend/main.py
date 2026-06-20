import os
import asyncio
import tempfile
import base64
import json
import traceback
from typing import Dict, Any, AsyncGenerator
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor

app = FastAPI(title="Project Hologram Control Matrix")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

# Heavy model cache
whisper_model = None

# Thread pool for synchronous tasks (like local pyttsx3 synthesis, file writes, and STT running)
sync_executor = ThreadPoolExecutor(max_workers=4)
# Single thread executor for pyttsx3 to prevent SAPI5 COM errors on Windows
tts_executor = ThreadPoolExecutor(max_workers=1)

def get_whisper_model():
    """Lazily loads the Whisper model to speed up server boot."""
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        # Use CPU with int8 quantization for high compatibility and performance on consumer hardware
        whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    return whisper_model

def _run_pyttsx3(text: str, file_path: str):
    """Initializes and runs pyttsx3 inside a dedicated thread."""
    import pyttsx3
    engine = pyttsx3.init()
    engine.setProperty('rate', 165)  # slightly faster for natural conversation flow
    engine.save_to_file(text, file_path)
    engine.runAndWait()
    del engine  # clean up COM references

async def synthesize_local_tts(text: str) -> bytes:
    """Runs local TTS in a single-threaded executor to avoid SAPI COM threading issues."""
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    temp_file_path = temp_file.name
    temp_file.close()

    try:
        await asyncio.get_running_loop().run_in_executor(
            tts_executor,
            _run_pyttsx3,
            text,
            temp_file_path
        )
        with open(temp_file_path, "rb") as f:
            data = f.read()
        return data
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

async def synthesize_cloud_tts_fallback(text: str) -> bytes:
    """Streams high-quality Microsoft Edge TTS cloud audio."""
    import edge_tts
    # Use en-US-AvaNeural for a highly expressive, premium-sounding synthetic voice
    communicate = edge_tts.Communicate(text, "en-US-AvaNeural")
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data

async def synthesize_cloud_tts_nvidia(text: str, base_url: str, api_key: str, model_name: str) -> bytes:
    """Uses NVIDIA NIM API to synthesize speech."""
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        response = await client.audio.speech.create(
            model=model_name,
            input=text,
            voice="alloy",
            response_format="wav"
        )
        if hasattr(response, "content"):
            return response.content
        elif hasattr(response, "read"):
            if asyncio.iscoroutinefunction(response.read):
                return await response.read()
            return response.read()
    except Exception as e:
        print(f"AsyncOpenAI client TTS failed: {e}. Trying direct httpx POST...")
        
    import httpx
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient() as http_client:
        url = base_url.rstrip("/") + "/audio/speech"
        res = await http_client.post(
            url,
            headers=headers,
            json={
                "model": model_name,
                "input": text,
                "voice": "alloy",
                "response_format": "wav"
            },
            timeout=10.0
        )
        res.raise_for_status()
        return res.content

async def transcribe_local_stt(file_path: str) -> str:
    """Uses faster-whisper to transcribe audio locally."""
    def _transcribe():
        model = get_whisper_model()
        segments, info = model.transcribe(file_path, beam_size=3)
        return " ".join([seg.text for seg in segments]).strip()

    return await asyncio.get_running_loop().run_in_executor(sync_executor, _transcribe)

async def transcribe_cloud_stt_fallback(file_path: str) -> str:
    """Uses SpeechRecognition library with free Google API fallback."""
    import speech_recognition as sr
    r = sr.Recognizer()

    def _recognize():
        with sr.AudioFile(file_path) as source:
            audio_data = r.record(source)
        try:
            return r.recognize_google(audio_data)
        except sr.UnknownValueError:
            return ""
        except Exception as e:
            return f"[Cloud STT error: {e}]"

    return await asyncio.get_running_loop().run_in_executor(sync_executor, _recognize)

async def transcribe_cloud_stt_nvidia(file_path: str, base_url: str, api_key: str, model_name: str) -> str:
    """Uses NVIDIA NIM API to transcribe audio."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    with open(file_path, "rb") as audio_file:
        transcript_obj = await client.audio.transcriptions.create(
            file=audio_file,
            model=model_name,
            response_format="text"
        )
        if isinstance(transcript_obj, str):
            return transcript_obj
        return getattr(transcript_obj, "text", str(transcript_obj))

async def get_local_llm_stream(model_name: str, system_prompt: str, user_text: str) -> AsyncGenerator[str, None]:
    """Streams responses from local Ollama server using OpenAI compatibility."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    response = await client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text}
        ],
        stream=True
    )
    async for chunk in response:
        token = chunk.choices[0].delta.content
        if token:
            yield token

async def get_cloud_llm_stream(base_url: str, api_key: str, model_name: str, system_prompt: str, user_text: str, max_tokens: int) -> AsyncGenerator[str, None]:
    """Streams responses from Cloud LLM endpoint using OpenAI API client."""
    from openai import AsyncOpenAI
    client = AsyncOpenAI(base_url=base_url, api_key=api_key)
    response = await client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text}
        ],
        max_tokens=max_tokens,
        stream=True
    )
    async for chunk in response:
        token = chunk.choices[0].delta.content
        if token:
            yield token

async def chunk_sentences(token_generator: AsyncGenerator[str, None]) -> AsyncGenerator[str, None]:
    """Accumulates tokens and yields full sentences dynamically based on terminators."""
    accumulated = ""
    sentence_terminators = {'.', '?', '!'}

    async for token in token_generator:
        accumulated += token
        while True:
            split_idx = -1
            # Look for terminator followed by whitespace
            for i in range(len(accumulated)):
                char = accumulated[i]
                if char in sentence_terminators:
                    if i + 1 < len(accumulated) and accumulated[i+1].isspace():
                        split_idx = i + 1
                        break

            # If no whitespace terminator found, check for newlines
            if split_idx == -1:
                if "\n" in accumulated:
                    idx = accumulated.index("\n")
                    if idx > 25:  # ensure it's not a short title
                        split_idx = idx + 1

            # Fallback for very long blocks with no punctuation
            if split_idx == -1 and len(accumulated) > 130:
                for i in range(len(accumulated) - 1, 60, -1):
                    if accumulated[i] in {',', ';', ' '}:
                        split_idx = i + 1
                        break

            if split_idx != -1:
                sentence = accumulated[:split_idx].strip()
                accumulated = accumulated[split_idx:]
                if sentence:
                    yield sentence
            else:
                break

    remaining = accumulated.strip()
    if remaining:
        yield remaining

async def send_tokens_and_yield(websocket: WebSocket, token_generator: AsyncGenerator[str, None]) -> AsyncGenerator[str, None]:
    """Intercepts tokens from the stream, sends them to the client, and yields them for chunking."""
    async for token in token_generator:
        await websocket.send_json({"type": "llm_token", "text": token})
        yield token

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Active configuration for this session
    config = {
        "ears": "cloud",
        "brain": "local",
        "voice": "cloud",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "nvidia_api_key": "",
        "local_llm_model": "qwen2.5-coder:7b",
        "cloud_llm_model": "meta/llama-3.3-70b-instruct",
        "cloud_stt_model": "nvidia/parakeet-tdt-0.6b-v2",
        "cloud_tts_model": "nvidia/magpie-tts-zeroshot",
        "system_prompt": "You are HAL-9000, a holographic voice AI assistant inside a futuristic spaceship. Be highly intelligent, slightly robotic, and helpful.",
        "max_tokens": 4096,
        "vad_threshold": 1000
    }

    try:
        while True:
            # All messages from our updated client are JSON text strings
            text_data = await websocket.receive_text()
            data = json.loads(text_data)
            
            if data.get("type") == "config":
                config.update(data.get("payload", {}))
                await websocket.send_json({"type": "status", "message": "Configuration updated."})
            
            elif data.get("type") == "audio":
                audio_b64 = data.get("audio")
                if "config" in data:
                    config.update(data["config"])
                
                audio_bytes = base64.b64decode(audio_b64)
                
                # Notify client we are transcribing
                await websocket.send_json({"type": "status", "message": "Transcribing audio..."})
                
                # Write incoming WAV data to a temporary file
                temp_audio = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
                temp_audio_path = temp_audio.name
                temp_audio.write(audio_bytes)
                temp_audio.close()
                
                try:
                    # 1. Speech-To-Text Routing
                    if config["ears"] == "local":
                        transcript = await transcribe_local_stt(temp_audio_path)
                    else:
                        if config.get("nvidia_api_key") and "nvidia" in config.get("cloud_stt_model", ""):
                            try:
                                transcript = await transcribe_cloud_stt_nvidia(
                                    temp_audio_path,
                                    config.get("base_url", "https://integrate.api.nvidia.com/v1"),
                                    config["nvidia_api_key"],
                                    config["cloud_stt_model"]
                                )
                            except Exception as e:
                                print(f"NVIDIA Cloud STT failed: {e}. Falling back to Google ASR.")
                                transcript = await transcribe_cloud_stt_fallback(temp_audio_path)
                        else:
                            transcript = await transcribe_cloud_stt_fallback(temp_audio_path)
                    
                    if not transcript:
                        await websocket.send_json({"type": "status", "message": "No speech detected. Try again."})
                        continue
                    
                    # Send transcript back to client
                    await websocket.send_json({"type": "user_transcript", "text": transcript})
                    
                    # 2. LLM Stream and Sentence synthesis pipeline
                    await websocket.send_json({"type": "status", "message": "Thinking..."})
                    await websocket.send_json({"type": "llm_start"})
                    
                    if config["brain"] == "cloud":
                        if not config["nvidia_api_key"]:
                            raise ValueError("NVIDIA NIM API Key is missing. Set it in the sidebar settings.")
                        raw_stream = get_cloud_llm_stream(
                            config.get("base_url", "https://integrate.api.nvidia.com/v1"),
                            config["nvidia_api_key"],
                            config["cloud_llm_model"],
                            config["system_prompt"],
                            transcript,
                            config.get("max_tokens", 4096)
                        )
                    else:
                        raw_stream = get_local_llm_stream(
                            config["local_llm_model"],
                            config["system_prompt"],
                            transcript
                        )
                    
                    # Process stream through interceptor (sends raw tokens) and chunker
                    async for sentence in chunk_sentences(send_tokens_and_yield(websocket, raw_stream)):
                        # 3. Text-To-Speech Routing and Send audio base64
                        try:
                            if config["voice"] == "local":
                                tts_data = await synthesize_local_tts(sentence)
                            else:
                                if config.get("nvidia_api_key") and config.get("cloud_tts_model") == "nvidia/magpie-tts-zeroshot":
                                    try:
                                        tts_data = await synthesize_cloud_tts_nvidia(
                                            sentence,
                                            config.get("base_url", "https://integrate.api.nvidia.com/v1"),
                                            config["nvidia_api_key"],
                                            config["cloud_tts_model"]
                                        )
                                    except Exception as e:
                                        print(f"NVIDIA Cloud TTS failed: {e}. Falling back to edge-tts.")
                                        tts_data = await synthesize_cloud_tts_fallback(sentence)
                                else:
                                    tts_data = await synthesize_cloud_tts_fallback(sentence)
                            
                            tts_b64 = base64.b64encode(tts_data).decode('utf-8')
                            await websocket.send_json({
                                "type": "audio_chunk",
                                "text": sentence,
                                "audio": tts_b64
                            })
                        except Exception as tts_err:
                            print(f"TTS Error: {tts_err}")
                            traceback.print_exc()
                            # Send plain text chunk if voice fails
                            await websocket.send_json({
                                "type": "audio_chunk",
                                "text": sentence,
                                "audio": ""
                            })
                    
                    await websocket.send_json({"type": "llm_end"})
                    await websocket.send_json({"type": "status", "message": "Ready"})
                
                except Exception as pipeline_err:
                    print(f"Pipeline Error: {pipeline_err}")
                    traceback.print_exc()
                    await websocket.send_json({"type": "error", "message": str(pipeline_err)})
                    await websocket.send_json({"type": "status", "message": "Error occurred."})
                finally:
                    if os.path.exists(temp_audio_path):
                        try:
                            os.remove(temp_audio_path)
                        except Exception:
                            pass

    except WebSocketDisconnect:
        print("WebSocket client disconnected.")
    except Exception as e:
        print(f"WebSocket execution error: {e}")
        traceback.print_exc()

# Mount frontend
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory '{FRONTEND_DIR}' does not exist yet. Please create it.")

