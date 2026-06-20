# SETUP GUIDE: Project Hologram Control Matrix

Welcome to Phase 1 of the Project Hologram Control Matrix—a highly optimized, decoupled prototype for a future Unity VR application featuring live Speech-To-Text (STT), LLM cognitive streaming, and Text-To-Speech (TTS) response synthesis.

---

## 1. Prerequisites & Installation

To run this prototype locally on Windows, ensure you have the following installed:
1. **Python 3.10+**: Ensure Python is added to your Windows system PATH environment variables.
2. **Ollama (Optional - for Local LLM)**: Download and install Ollama from [ollama.com](https://ollama.com).

---

## 2. Dynamic Routing Settings

### Local Mode (Highly Secure & Offline)
- **STT (Ears)**: Uses local `faster-whisper` (`tiny.en`) running directly on your CPU.
- **LLM (Brain)**: Interconnects with your local Ollama engine. Run your desired local model (e.g., `qwen2.5-coder:7b` or `llama3`) by executing:
  ```powershell
  ollama run qwen2.5-coder:7b
  ```
- **TTS (Voice)**: Synthesizes voice utilizing the native Windows SAPI5 COM engine (`pyttsx3`) running in a dedicated single-threaded queue.

### Cloud Mode (Ultra Low-Latency & Expressive)
- **STT (Ears)**: Uses cloud-scale ASR models (`nvidia/parakeet-tdt-0.6b-v2` or `nvidia/canary-1b-asr`).
- **LLM (Brain)**: Interfaces with NVIDIA NIM or OpenAI compatible APIs.
- **TTS (Voice)**: Streams high-fidelity neural voices (`nvidia/magpie-tts-zeroshot` or expressive Microsoft Neural voices via `edge-tts`).

---

## 3. How to Launch (1-Click)

1. Simply double-click **`Launch_Hologram.bat`** in the project's root folder.
2. The batch script will automatically:
   - Create a Python virtual environment (`venv`) if it does not exist.
   - Silently install all packages listed in `requirements.txt`.
   - Start the FastAPI backend server on `http://127.0.0.1:8000`.
   - Open your default browser to access the glowing Hologram Matrix UI.

---

## 4. Setting up a Custom Desktop Icon

To turn this prototype into an executable-like desktop utility:
1. Navigate to the `hologram_control_matrix` root directory in Windows Explorer.
2. Right-click the **`Launch_Hologram.bat`** file and select **Send to -> Desktop (create shortcut)**.
3. Go to your Desktop, right-click the newly created shortcut, and select **Properties**.
4. Under the **Shortcut** tab, click **Change Icon...**.
5. Select a pre-existing icon (.ico file) from your system or browse to assign a custom futuristic or graphic icon.
6. Click **Apply** and then **OK**. You can also rename the shortcut to "Hologram Control Matrix".
