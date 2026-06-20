// state management & configuration variables
let socket = null;
let audioCtx = null;
let micSource = null;
let scriptNode = null;
let isSpeaking = false;
let silenceTimeout = null;
let pcmBuffers = [];
let recordingLength = 0;
let ttsAnalyser = null;
let micAnalyser = null;
let audioPlayerQueue = null;

// UI elements cache
const routeSTT = document.getElementById('routeSTT');
const routeLLM = document.getElementById('routeLLM');
const routeTTS = document.getElementById('routeTTS');
const baseUrl = document.getElementById('baseUrl');
const nvidiaApiKey = document.getElementById('nvidiaApiKey');
const nimKeyContainer = document.getElementById('nimKeyContainer');
const localModel = document.getElementById('localModel');
const cloudModel = document.getElementById('cloudModel');
const cloudSTT = document.getElementById('cloudSTT');
const cloudTTS = document.getElementById('cloudTTS');
const maxTokens = document.getElementById('maxTokens');
const systemPrompt = document.getElementById('systemPrompt');
const vadThreshold = document.getElementById('vadThreshold');
const vadThresholdVal = document.getElementById('vadThresholdVal');
const vadMeterFill = document.getElementById('vadMeterFill');
const dbValue = document.getElementById('dbValue');
const toggleSidebar = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const sidebarIcon = document.getElementById('sidebarIcon');
const statusWs = document.getElementById('statusWs');
const statusAudio = document.getElementById('statusAudio');
const statusPipeline = document.getElementById('statusPipeline');
const userText = document.getElementById('userText');
const aiText = document.getElementById('aiText');
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const connectionStatusDot = document.getElementById('connectionStatusDot');
const fpsCount = document.getElementById('fpsCount');

const cloudSTTContainer = document.getElementById('cloudSTTContainer');
const cloudTTSContainer = document.getElementById('cloudTTSContainer');
const localLLMContainer = document.getElementById('localLLMContainer');
const cloudLLMContainer = document.getElementById('cloudLLMContainer');

// Toggles
const toggleSTTLocal = document.getElementById('toggleSTTLocal');
const toggleSTTCloud = document.getElementById('toggleSTTCloud');
const toggleLLMLocal = document.getElementById('toggleLLMLocal');
const toggleLLMCloud = document.getElementById('toggleLLMCloud');
const toggleTTSLocal = document.getElementById('toggleTTSLocal');
const toggleTTSCloud = document.getElementById('toggleTTSCloud');

// Configuration values from LocalStorage
const STORAGE_KEYS = {
    EARS: 'hologram_ears',
    BRAIN: 'hologram_brain',
    VOICE: 'hologram_voice',
    BASE_URL: 'hologram_base_url',
    NVIDIA_KEY: 'hologram_nvidia_key',
    LOCAL_MODEL: 'hologram_local_model',
    CLOUD_MODEL: 'hologram_cloud_model',
    CLOUD_STT: 'hologram_cloud_stt',
    CLOUD_TTS: 'hologram_cloud_tts',
    SYSTEM_PROMPT: 'hologram_system_prompt',
    MAX_TOKENS: 'hologram_max_tokens',
    VAD_THRESHOLD: 'hologram_vad_threshold',
};

// Initial state loading
function loadSettings() {
    routeSTT.value = localStorage.getItem(STORAGE_KEYS.EARS) || 'cloud';
    routeLLM.value = localStorage.getItem(STORAGE_KEYS.BRAIN) || 'local';
    routeTTS.value = localStorage.getItem(STORAGE_KEYS.VOICE) || 'cloud';
    
    baseUrl.value = localStorage.getItem(STORAGE_KEYS.BASE_URL) || 'https://integrate.api.nvidia.com/v1';
    nvidiaApiKey.value = localStorage.getItem(STORAGE_KEYS.NVIDIA_KEY) || '';
    
    localModel.value = localStorage.getItem(STORAGE_KEYS.LOCAL_MODEL) || 'qwen2.5-coder:7b';
    cloudModel.value = localStorage.getItem(STORAGE_KEYS.CLOUD_MODEL) || 'meta/llama-3.3-70b-instruct';
    cloudSTT.value = localStorage.getItem(STORAGE_KEYS.CLOUD_STT) || 'nvidia/parakeet-tdt-0.6b-v2';
    cloudTTS.value = localStorage.getItem(STORAGE_KEYS.CLOUD_TTS) || 'nvidia/magpie-tts-zeroshot';
    
    systemPrompt.value = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) || 'You are HAL-9000, a holographic voice AI assistant inside a futuristic spaceship. Be highly intelligent, slightly robotic, and helpful.';
    maxTokens.value = localStorage.getItem(STORAGE_KEYS.MAX_TOKENS) || '4096';
    vadThreshold.value = localStorage.getItem(STORAGE_KEYS.VAD_THRESHOLD) || '1000';
    
    vadThresholdVal.textContent = `${vadThreshold.value}ms`;
    
    setToggleButtonState('STT', routeSTT.value === 'cloud');
    setToggleButtonState('LLM', routeLLM.value === 'cloud');
    setToggleButtonState('TTS', routeTTS.value === 'cloud');
    
    updateVisibility();
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.EARS, routeSTT.value);
    localStorage.setItem(STORAGE_KEYS.BRAIN, routeLLM.value);
    localStorage.setItem(STORAGE_KEYS.VOICE, routeTTS.value);
    localStorage.setItem(STORAGE_KEYS.BASE_URL, baseUrl.value);
    localStorage.setItem(STORAGE_KEYS.NVIDIA_KEY, nvidiaApiKey.value);
    localStorage.setItem(STORAGE_KEYS.LOCAL_MODEL, localModel.value);
    localStorage.setItem(STORAGE_KEYS.CLOUD_MODEL, cloudModel.value);
    localStorage.setItem(STORAGE_KEYS.CLOUD_STT, cloudSTT.value);
    localStorage.setItem(STORAGE_KEYS.CLOUD_TTS, cloudTTS.value);
    localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, systemPrompt.value);
    localStorage.setItem(STORAGE_KEYS.MAX_TOKENS, maxTokens.value);
    localStorage.setItem(STORAGE_KEYS.VAD_THRESHOLD, vadThreshold.value);
}

function setToggleButtonState(groupName, isCloud) {
    const localBtn = document.getElementById(`toggle${groupName}Local`);
    const cloudBtn = document.getElementById(`toggle${groupName}Cloud`);
    
    if (isCloud) {
        // Cloud active
        cloudBtn.className = "py-1.5 text-[10px] uppercase font-cyber font-bold tracking-wider rounded-md text-cyan-400 bg-cyan-950/50 border border-cyan-500/30 shadow-lg shadow-cyan-500/10 transition-all cursor-pointer";
        localBtn.className = "py-1.5 text-[10px] uppercase font-cyber font-bold tracking-wider rounded-md text-slate-400 bg-transparent hover:text-slate-200 transition-all cursor-pointer";
    } else {
        // Local active
        localBtn.className = "py-1.5 text-[10px] uppercase font-cyber font-bold tracking-wider rounded-md text-pink-400 bg-pink-950/50 border border-pink-500/30 shadow-lg shadow-pink-500/10 transition-all cursor-pointer";
        cloudBtn.className = "py-1.5 text-[10px] uppercase font-cyber font-bold tracking-wider rounded-md text-slate-400 bg-transparent hover:text-slate-200 transition-all cursor-pointer";
    }
}

function updateVisibility() {
    if (routeLLM.value === 'cloud') {
        nimKeyContainer.classList.remove('hidden');
        cloudLLMContainer.classList.remove('hidden');
        localLLMContainer.classList.add('hidden');
    } else {
        nimKeyContainer.classList.add('hidden');
        cloudLLMContainer.classList.add('hidden');
        localLLMContainer.classList.remove('hidden');
    }
    
    if (routeSTT.value === 'cloud') {
        cloudSTTContainer.classList.remove('hidden');
    } else {
        cloudSTTContainer.classList.add('hidden');
    }
    
    if (routeTTS.value === 'cloud') {
        cloudTTSContainer.classList.remove('hidden');
    } else {
        cloudTTSContainer.classList.add('hidden');
    }
}

// WS communications
function sendConfiguration() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'config',
            payload: {
                ears: routeSTT.value,
                brain: routeLLM.value,
                voice: routeTTS.value,
                base_url: baseUrl.value,
                nvidia_api_key: nvidiaApiKey.value,
                local_llm_model: localModel.value,
                cloud_llm_model: cloudModel.value,
                cloud_stt_model: cloudSTT.value,
                cloud_tts_model: cloudTTS.value,
                system_prompt: systemPrompt.value,
                max_tokens: parseInt(maxTokens.value) || 4096,
                vad_silence_threshold: parseInt(vadThreshold.value)
            }
        }));
    }
}


function connectWebSocket() {
    const isFile = window.location.protocol === 'file:';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isFile ? '127.0.0.1:8000' : window.location.host;
    const wsUrl = `${isFile ? 'ws:' : protocol}//${host}/ws`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        statusWs.textContent = 'CONNECTED';
        statusWs.className = 'text-cyan-400 neon-text-cyan';
        connectionStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse neon-shadow-cyan';
        sendConfiguration();
    };
    
    socket.onclose = () => {
        statusWs.textContent = 'DISCONNECTED';
        statusWs.className = 'text-red-500 neon-text-red';
        connectionStatusDot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse neon-shadow-red';
        // Auto-reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
    
    socket.onerror = (err) => {
        console.error('WebSocket Error:', err);
    };
    
    socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
            case 'status':
                statusPipeline.textContent = msg.message.toUpperCase();
                break;
                
            case 'user_transcript':
                userText.textContent = msg.text;
                break;
                
            case 'llm_start':
                aiText.textContent = '';
                // Clear any leftover voice queue
                if (audioPlayerQueue) {
                    audioPlayerQueue.stopAll();
                }
                break;
                
            case 'llm_token':
                aiText.textContent += msg.text;
                aiText.scrollTop = aiText.scrollHeight;
                break;
                
            case 'audio_chunk':
                if (msg.audio && audioPlayerQueue) {
                    // Queue TTS voice chunk
                    audioPlayerQueue.enqueue(
                        msg.audio, 
                        () => {
                            statusPipeline.textContent = "AI SPEAKING";
                            statusPipeline.className = "text-pink-400 neon-text-magenta";
                        }, 
                        () => {
                            if (!audioPlayerQueue.isPlaying) {
                                statusPipeline.textContent = "IDLE";
                                statusPipeline.className = "text-cyan-400";
                            }
                        }
                    );
                }
                break;
                
            case 'llm_end':
                // Streaming text has ended, speaker queue handles remaining voice
                break;
                
            case 'error':
                aiText.innerHTML = `<span class="text-red-500 font-bold">[Error]: ${msg.message}</span>`;
                statusPipeline.textContent = 'ERROR';
                statusPipeline.className = 'text-red-500';
                break;
        }
    };
}

// Queue based audio output system
class AudioPlayerQueue {
    constructor(ctx, analyser) {
        this.ctx = ctx;
        this.analyser = analyser;
        this.queue = [];
        this.isPlaying = false;
        this.currentSource = null;
    }

    async enqueue(base64Audio, onStart, onEnd) {
        const arrayBuf = this._base64ToArrayBuffer(base64Audio);
        try {
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuf);
            this.queue.push({ audioBuffer, onStart, onEnd });
            if (!this.isPlaying) {
                this.playNext();
            }
        } catch (e) {
            console.error('Failed to decode TTS audio buffer:', e);
        }
    }

    _base64ToArrayBuffer(base64) {
        const bin = window.atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes.buffer;
    }

    playNext() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const { audioBuffer, onStart, onEnd } = this.queue.shift();

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Route audio through analyzer and output destination
        source.connect(this.analyser);
        
        source.onended = () => {
            if (onEnd) onEnd();
            this.playNext();
        };

        if (onStart) onStart();
        source.start(0);
        this.currentSource = source;
    }

    stopAll() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {}
        }
        this.queue = [];
        this.isPlaying = false;
    }
}

// Audio Recording and VAD Logic
async function initAudioEngine() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Analyser for active TTS output (fed into Three.js)
        ttsAnalyser = audioCtx.createAnalyser();
        ttsAnalyser.fftSize = 128;
        ttsAnalyser.connect(audioCtx.destination);
        audioPlayerQueue = new AudioPlayerQueue(audioCtx, ttsAnalyser);
        
        // Input mic routing
        micSource = audioCtx.createMediaStreamSource(stream);
        micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micSource.connect(micAnalyser);
        
        // Script Processor for raw volume analysis (VAD)
        scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
        micSource.connect(scriptNode);
        scriptNode.connect(audioCtx.destination); // Required to trigger process callback
        
        scriptNode.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Compute RMS amplitude
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            
            // Update live volume display
            const volumePercent = Math.min(100, Math.round(rms * 400));
            vadMeterFill.style.width = `${volumePercent}%`;
            dbValue.textContent = `${volumePercent}%`;
            
            // Fixed RMS voice gate threshold (0.015)
            const thresholdVolume = 0.015;
            
            if (rms > thresholdVolume) {
                // User is talking
                if (!isSpeaking) {
                    isSpeaking = true;
                    statusAudio.textContent = 'RECORDING';
                    statusAudio.className = 'text-emerald-400 neon-text-emerald';
                    micBtn.classList.remove('neon-border-cyan');
                    micBtn.classList.add('neon-border-magenta', 'border-pink-500', 'text-pink-500');
                    micLabel.textContent = "Listening...";
                    micLabel.className = "text-[9px] uppercase tracking-widest text-pink-400 font-bold mt-1";
                    
                    // Stop AI voice immediately if user interrupts
                    audioPlayerQueue.stopAll();
                    pcmBuffers = [];
                    recordingLength = 0;
                }
                
                if (silenceTimeout) {
                    clearTimeout(silenceTimeout);
                    silenceTimeout = null;
                }
            } else {
                // User is quiet
                if (isSpeaking && !silenceTimeout) {
                    const silenceLimit = parseInt(vadThreshold.value);
                    silenceTimeout = setTimeout(() => {
                        finalizeSpeechAndSend();
                    }, silenceLimit);
                }
            }
            
            // Record samples while active
            if (isSpeaking) {
                const copy = new Float32Array(inputData);
                pcmBuffers.push(copy);
                recordingLength += copy.length;
            }
        };
        
        statusAudio.textContent = 'LISTENING';
        statusAudio.className = 'text-cyan-400 neon-text-cyan';
        micLabel.textContent = "Voice Active";
        micLabel.className = "text-[9px] uppercase tracking-widest text-cyan-400 font-bold mt-1";
        
    } catch (err) {
        console.error('Failed to access microphone:', err);
        statusAudio.textContent = 'MUTED (FAIL)';
        statusAudio.className = 'text-red-500';
    }
}

function finalizeSpeechAndSend() {
    isSpeaking = false;
    silenceTimeout = null;
    statusAudio.textContent = 'LISTENING';
    statusAudio.className = 'text-cyan-400 neon-text-cyan';
    micBtn.classList.remove('neon-border-magenta', 'border-pink-500', 'text-pink-500');
    micBtn.classList.add('neon-border-cyan');
    micLabel.textContent = "Voice Active";
    micLabel.className = "text-[9px] uppercase tracking-widest text-cyan-400 font-bold mt-1";
    
    if (pcmBuffers.length === 0) return;
    
    // Merge PCM buffers
    const merged = new Float32Array(recordingLength);
    let offset = 0;
    for (let i = 0; i < pcmBuffers.length; i++) {
        merged.set(pcmBuffers[i], offset);
        offset += pcmBuffers[i].length;
    }
    
    // Encode to mono WAV at local AudioContext sample rate
    const wavBlob = encodeWAV(merged, audioCtx.sampleRate);
    
    // Convert WAV blob to Base64 and send with configuration payload
    const reader = new FileReader();
    reader.readAsDataURL(wavBlob);
    reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'audio',
                audio: base64Audio,
                config: {
                    ears: routeSTT.value,
                    brain: routeLLM.value,
                    voice: routeTTS.value,
                    base_url: baseUrl.value,
                    nvidia_api_key: nvidiaApiKey.value,
                    local_llm_model: localModel.value,
                    cloud_llm_model: cloudModel.value,
                    cloud_stt_model: cloudSTT.value,
                    cloud_tts_model: cloudTTS.value,
                    system_prompt: systemPrompt.value,
                    max_tokens: parseInt(maxTokens.value) || 4096,
                    vad_threshold: parseInt(vadThreshold.value)
                }
            }));
        }
    };
    
    pcmBuffers = [];
    recordingLength = 0;
}

// WAV file compilation helper
function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    
    const writeStr = (v, offset, str) => {
        for (let i = 0; i < str.length; i++) {
            v.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    
    writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(view, 8, 'WAVE');
    writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    
    // Convert float samples to 16-bit signed PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    
    return new Blob([view], { type: 'audio/wav' });
}

// THREE.JS GLOWING HOLOGRAM ORB GRAPHICS
let scene, camera, renderer, orbMesh, innerOrbMesh, gridMesh, particleSystem;
let clock = new THREE.Clock();

function initThreeScene() {
    const container = document.getElementById('canvasContainer');
    
    scene = new THREE.Scene();
    
    // Smooth Perspective Camera setup
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.2, 5.5);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    
    // Handle container scaling
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Custom Shader ShaderMaterial for dynamic hologram morphing core
    const customVertexShader = `
        uniform float uTime;
        uniform float uAudioAmp;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            
            // Distort vertices based on sinusoidal noise waves
            float waveX = sin(position.x * 2.5 + uTime * 3.0);
            float waveY = cos(position.y * 2.5 + uTime * 2.5);
            float waveZ = sin(position.z * 2.5 + uTime * 4.0);
            
            // Scale distortion amplitude using volume feed
            float displacement = (waveX + waveY + waveZ) * (0.05 + uAudioAmp * 0.45);
            
            vec3 newPosition = position + normal * displacement;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
    `;

    const customFragmentShader = `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uAudioAmp;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
            // Fresnel glow calculation (bright edges, glowing envelope)
            float viewAngle = dot(vNormal, vec3(0.0, 0.0, 1.0));
            float glow = pow(1.0 - viewAngle, 2.5);
            
            // Sub-glow core intensity
            float core = pow(viewAngle, 4.0) * 0.2;
            
            // Reactive shift between Cyan and hot pink/magenta
            vec3 glowColor = uColor;
            glowColor.r += uAudioAmp * 0.65;
            glowColor.g -= uAudioAmp * 0.3;
            glowColor.b += uAudioAmp * 0.4;
            
            vec3 finalColor = glowColor * (glow + core);
            
            // Matrix laser scanning ring lines
            float scanLine = sin(vPosition.y * 35.0 - uTime * 6.0) * 0.04 * (1.0 + uAudioAmp * 3.0);
            finalColor += vec3(scanLine);
            
            gl_FragColor = vec4(finalColor, (glow * 0.9 + core) * 0.85);
        }
    `;

    const uniforms = {
        uTime: { value: 0 },
        uAudioAmp: { value: 0 },
        uColor: { value: new THREE.Color(0x06b6d4) }, // Base Cyan
    };

    // 1. Core Plasma Sphere
    const innerGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const innerMat = new THREE.ShaderMaterial({
        vertexShader: customVertexShader,
        fragmentShader: customFragmentShader,
        uniforms: uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    innerOrbMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerOrbMesh);

    // 2. Outer cyber-cage (Wireframe shell)
    const outerGeo = new THREE.SphereGeometry(1.15, 24, 24);
    const outerMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending
    });
    orbMesh = new THREE.Mesh(outerGeo, outerMat);
    scene.add(orbMesh);

    // 3. Glowing ripple grid floor
    const gridGeo = new THREE.PlaneGeometry(12, 12, 32, 32);
    gridGeo.rotateX(-Math.PI / 2);
    const gridMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        wireframe: true,
        transparent: true,
        opacity: 0.08
    });
    gridMesh = new THREE.Mesh(gridGeo, gridMat);
    gridMesh.position.y = -1.4;
    scene.add(gridMesh);

    // 4. Orbital Cybernetic Ring (Swirling dust particles)
    const particleCount = 400;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    const cyan = new THREE.Color(0x06b6d4);
    
    for (let i = 0; i < particleCount; i++) {
        // Place particles in a flat circle ring around orb
        const radius = 1.3 + Math.random() * 0.8;
        const angle = Math.random() * Math.PI * 2;
        
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.15; // flat spread
        positions[i * 3 + 2] = Math.sin(angle) * radius;
        
        colors[i * 3] = cyan.r;
        colors[i * 3 + 1] = cyan.g;
        colors[i * 3 + 2] = cyan.b;
    }
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // Create soft round particles using Canvas texture
    const pTexture = createParticleTexture();
    const particleMat = new THREE.PointsMaterial({
        size: 0.05,
        map: pTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    
    particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // Minimal Stage Ambient Light
    const ambLight = new THREE.AmbientLight(0x030712, 0.8);
    scene.add(ambLight);
    
    const pLight = new THREE.PointLight(0xec4899, 1.2, 8); // Pink specular glow light
    pLight.position.set(2, 2, 2);
    scene.add(pLight);

    animate();
}

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    return new THREE.CanvasTexture(canvas);
}

// Diagnostic variables for FPS
let lastTime = 0;
let frames = 0;

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    // Compute FPS
    frames++;
    if (time > lastTime + 1.0) {
        fpsCount.textContent = `${frames} FPS`;
        frames = 0;
        lastTime = time;
    }

    // 1. Gather audio volume amplitude
    let amp = 0;
    if (ttsAnalyser && audioPlayerQueue && audioPlayerQueue.isPlaying) {
        const dataArr = new Uint8Array(ttsAnalyser.frequencyBinCount);
        ttsAnalyser.getByteFrequencyData(dataArr);
        
        let sum = 0;
        for (let i = 0; i < dataArr.length; i++) {
            sum += dataArr[i];
        }
        amp = sum / dataArr.length / 255.0; // scale to 0.0 - 1.0
    }
    
    // 2. Send values to Shader Core uniforms
    innerOrbMesh.material.uniforms.uTime.value = time;
    innerOrbMesh.material.uniforms.uAudioAmp.value = amp;

    // Pulse core scale based on volume
    const targetCoreScale = 1.0 + amp * 0.55;
    innerOrbMesh.scale.lerp(new THREE.Vector3(targetCoreScale, targetCoreScale, targetCoreScale), 0.2);

    // 3. Rotate and wobble outer wireframe grid cage
    orbMesh.rotation.y = time * 0.15;
    orbMesh.rotation.x = time * 0.08;
    const targetCageScale = 1.0 + amp * 0.35;
    orbMesh.scale.lerp(new THREE.Vector3(targetCageScale, targetCageScale, targetCageScale), 0.15);

    // 4. Animate Grid ripples based on audio frequency
    const posAttr = gridMesh.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const dist = Math.sqrt(x*x + z*z);
        // Ripple out sine wave
        const height = Math.sin(dist - time * 4.5) * (0.04 + amp * 0.38) * Math.exp(-dist * 0.18);
        posAttr.setY(i, height);
    }
    posAttr.needsUpdate = true;

    // 5. Spin and wobble orbital particle swarm
    particleSystem.rotation.y = -time * 0.05;
    particleSystem.rotation.x = Math.sin(time * 0.5) * 0.08; // wobble ring
    
    // Animate color shift of particles (glow red/pink when loud)
    const pColorAttr = particleSystem.geometry.attributes.color;
    const baseCyan = new THREE.Color(0x06b6d4);
    const pulsePink = new THREE.Color(0xec4899);
    
    for (let i = 0; i < pColorAttr.count; i++) {
        const mixColor = baseCyan.clone().lerp(pulsePink, amp * 1.5);
        pColorAttr.setXYZ(i, mixColor.r, mixColor.g, mixColor.b);
    }
    pColorAttr.needsUpdate = true;

    renderer.render(scene, camera);
}

// UI Event bindings
function setupUIListeners() {
    // Sidebar fold
    toggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
        sidebar.classList.toggle('w-0');
        
        // Flip icon direction
        if (sidebar.classList.contains('-translate-x-full')) {
            sidebarIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25" />`;
        } else {
            sidebarIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />`;
        }
        // Force WebGL stage resize trigger
        setTimeout(() => {
            const container = document.getElementById('canvasContainer');
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        }, 310);
    });    // STT Toggles
    toggleSTTLocal.addEventListener('click', () => {
        routeSTT.value = 'local';
        setToggleButtonState('STT', false);
        updateVisibility();
        saveSettings();
        sendConfiguration();
    });
    toggleSTTCloud.addEventListener('click', () => {
        routeSTT.value = 'cloud';
        setToggleButtonState('STT', true);
        updateVisibility();
        saveSettings();
        sendConfiguration();
    });

    // LLM Toggles
    toggleLLMLocal.addEventListener('click', () => {
        routeLLM.value = 'local';
        setToggleButtonState('LLM', false);
        updateVisibility();
        saveSettings();
        sendConfiguration();
    });
    toggleLLMCloud.addEventListener('click', () => {
        routeLLM.value = 'cloud';
        setToggleButtonState('LLM', true);
        updateVisibility();
        saveSettings();
        sendConfiguration();
    });

    // TTS Toggles
    toggleTTSLocal.addEventListener('click', () => {
        routeTTS.value = 'local';
        setToggleButtonState('TTS', false);
        updateVisibility();
        saveSettings();
        sendConfiguration();
    });
    toggleTTSCloud.addEventListener('click', () => {
        routeTTS.value = 'cloud';
        setToggleButtonState('TTS', true);
        updateVisibility();
        saveSettings();
        sendConfiguration();
    });

    // Save and sync settings changes for standard inputs
    const configInputs = [baseUrl, nvidiaApiKey, localModel, cloudModel, cloudSTT, cloudTTS, maxTokens, systemPrompt, vadThreshold];
    configInputs.forEach(input => {
        input.addEventListener('change', () => {
            saveSettings();
            sendConfiguration();
        });
    });

    vadThreshold.addEventListener('input', () => {
        vadThresholdVal.textContent = `${vadThreshold.value}ms`;
        // Move red gate marker line in UI
        const thresholdPercent = ((vadThreshold.value - 300) / 1700) * 100;
        // Map gate marker visually between 20% and 80% left positioning
        const markerPos = 15 + (thresholdPercent / 100) * 70;
        document.getElementById('vadGateMarker').style.left = `${markerPos}%`;
    });

    // Initialize microphone engine
    micBtn.addEventListener('click', async () => {
        if (!audioCtx) {
            await initAudioEngine();
        } else if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
            statusAudio.textContent = 'LISTENING';
            statusAudio.className = 'text-cyan-400 neon-text-cyan';
        } else {
            // Toggle local microphone processing suspend state
            await audioCtx.suspend();
            statusAudio.textContent = 'MUTED';
            statusAudio.className = 'text-amber-500';
            micLabel.textContent = "Tap to Wake";
            micLabel.className = "text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1";
            micBtn.classList.remove('neon-border-magenta', 'border-pink-500', 'text-pink-500');
            micBtn.classList.add('neon-border-cyan');
        }
    });
}

// Initial boot
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initThreeScene();
    setupUIListeners();
    connectWebSocket();
});
