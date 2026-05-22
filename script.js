class ColorShiftVR {
    constructor() {

        this.cameraVideo = document.getElementById('cameraVideo');
        this.leftCanvas = document.getElementById('leftCanvas');
        this.rightCanvas = document.getElementById('rightCanvas');
        this.stopBtn = document.getElementById('stopBtn');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');
        this.sharpnessUpBtn = document.getElementById('sharpnessUpBtn');
        this.sharpnessDownBtn = document.getElementById('sharpnessDownBtn');
        this.sharpnessIndicator = document.getElementById('sharpnessIndicator');
        this.loading = document.getElementById('loading');
        this.error = document.getElementById('error');
        this.vrView = document.getElementById('vrView');
        this.controls = document.querySelector('.controls');
    this.zoomControls = document.querySelector('.zoom-controls');
    this.uvCrop = [0, 0, 1, 1]; 

        this.stream = null;
        this.isRunning = false;
    this.singleView = false; 
        this.zoomLevel = 1.2;
        this.minZoom = 0.5;
        this.maxZoom = 3.0;
        this.controlsTimeout = null;
        this.sharpnessLevel = 2.5;
        this.minSharpness = 0.5;
        this.maxSharpness = 2.5;
        this.lastFrameTime = 0;
        this.targetFPS = 30; 

        this.colorMode = 0;
        this.colorModeSelect = document.getElementById('colorModeSelect');
        this.leftGl = null;
        this.rightGl = null;
        this.leftProgram = null;
        this.rightProgram = null;
        this.leftTexture = null;
        this.rightTexture = null;
        this.leftUniforms = {};
        this.rightUniforms = {};

    this.apiUrl = '/api/proxy'; 
    this.openRouterKey = null; 
    this.maxRetries = 3;
    this.retryDelay = 1000; 

        this.startCameraBtn = document.getElementById('startCameraBtn');
        this.welcomeOverlay = document.getElementById('welcomeOverlay');

        this.initWebGL();
        this.initEventListeners();
        if (this.startCameraBtn) {
            this.startCameraBtn.addEventListener('click', () => this.launchApp());
        }
    }

    initWebGL() {
        try {

            this.leftGl = this.leftCanvas.getContext('webgl', { preserveDrawingBuffer: true });
            this.rightGl = this.rightCanvas.getContext('webgl', { preserveDrawingBuffer: true });

            if (!this.leftGl || !this.rightGl) {
                throw new Error('WebGL not supported');
            }

            this.leftProgram = this.setupWebGLContext(this.leftGl, 'left');
            this.rightProgram = this.setupWebGLContext(this.rightGl, 'right');

        } catch (error) {
            console.error('WebGL initialization failed:', error);
            this.showError('WebGL not supported. Please use a compatible browser.');
        }
    }

    setupWebGLContext(gl, side) {

        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;

            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShaderSource = `
            precision highp float;

            uniform sampler2D u_texture;
            uniform int u_colorMode;
            uniform float u_contrast;
            uniform float u_brightness;
            uniform float u_saturationBoost;
            uniform float u_sharpness;
            uniform vec2 u_resolution;
            uniform vec4 u_uvCrop; 

            varying vec2 v_texCoord;

            float getEdge(sampler2D tex, vec2 coord, vec2 resolution) {
                vec2 texel = 1.0 / resolution;
                float tl = length(texture2D(tex, coord + vec2(-texel.x, -texel.y)).rgb);
                float tm = length(texture2D(tex, coord + vec2(0.0, -texel.y)).rgb);
                float tr = length(texture2D(tex, coord + vec2(texel.x, -texel.y)).rgb);
                float ml = length(texture2D(tex, coord + vec2(-texel.x, 0.0)).rgb);
                float mm = length(texture2D(tex, coord).rgb);
                float mr = length(texture2D(tex, coord + vec2(texel.x, 0.0)).rgb);
                float bl = length(texture2D(tex, coord + vec2(-texel.x, texel.y)).rgb);
                float bm = length(texture2D(tex, coord + vec2(0.0, texel.y)).rgb);
                float br = length(texture2D(tex, coord + vec2(texel.x, texel.y)).rgb);
                float edge = abs(-tl - tm - tr - ml + 8.0*mm - mr - bl - bm - br);
                return edge;
            }

            void main() {
                vec2 uv = mix(u_uvCrop.xy, u_uvCrop.zw, v_texCoord);
                vec4 color = texture2D(u_texture, uv);
                vec3 rgb = color.rgb;

                // Only perform LMS transformations if colorMode > 0
                vec3 outColor = rgb;
                if (u_colorMode > 0) {
                    // RGB to LMS
                    float L = (17.8824 * rgb.r) + (43.5161 * rgb.g) + (4.11935 * rgb.b);
                    float M = (3.45565 * rgb.r) + (27.1554 * rgb.g) + (3.86714 * rgb.b);
                    float S = (0.0299566 * rgb.r) + (0.184309 * rgb.g) + (1.46709 * rgb.b);

                    // Simulated LMS
                    float l = L;
                    float m = M;
                    float s = S;

                    // Mode determines colorblindness simulation
                    // 1, 4: Protanopia
                    // 2, 5: Deuteranopia
                    // 3, 6: Tritanopia
                    if (u_colorMode == 1 || u_colorMode == 4) {
                        l = 0.0 * L + 2.02344 * M - 2.52581 * S;
                        m = 0.0 * L + 1.0 * M + 0.0 * S;
                        s = 0.0 * L + 0.0 * M + 1.0 * S;
                    } else if (u_colorMode == 2 || u_colorMode == 5) {
                        l = 1.0 * L + 0.0 * M + 0.0 * S;
                        m = 0.494207 * L + 0.0 * M + 1.24827 * S;
                        s = 0.0 * L + 0.0 * M + 1.0 * S;
                    } else if (u_colorMode == 3 || u_colorMode == 6) {
                        l = 1.0 * L + 0.0 * M + 0.0 * S;
                        m = 0.0 * L + 1.0 * M + 0.0 * S;
                        s = -0.395913 * L + 0.801109 * M + 0.0 * S;
                    }

                    // Simulated RGB
                    vec3 simulated;
                    simulated.r = (0.0809444479 * l) + (-0.130504409 * m) + (0.116721066 * s);
                    simulated.g = (-0.0102485335 * l) + (0.0540193266 * m) + (-0.113614708 * s);
                    simulated.b = (-0.000365296938 * l) + (-0.00412161469 * m) + (0.693511405 * s);
                    simulated = clamp(simulated, 0.0, 1.0);

                    if (u_colorMode >= 1 && u_colorMode <= 3) {
                        // Simulation only
                        outColor = simulated;
                    } else if (u_colorMode >= 4 && u_colorMode <= 6) {
                        // Daltonization / Correction
                        vec3 error = rgb - simulated;
                        vec3 correction;
                        correction.r = 0.0;
                        correction.g = (error.r * 0.7) + (error.g * 1.0);
                        correction.b = (error.r * 0.7) + (error.b * 1.0);
                        outColor = rgb + correction;
                    }
                }

                // Apply contrast/brightness correction
                outColor = (outColor - 0.5) * u_contrast + 0.5 + u_brightness;
                outColor = clamp(outColor, 0.0, 1.0);

                // Apply sharpness / edge enhancement
                float edge = getEdge(u_texture, uv, u_resolution);
                outColor += edge * u_sharpness * 0.1;

                gl_FragColor = vec4(clamp(outColor, 0.0, 1.0), color.a);
            }
        `;

        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        const program = this.createProgram(gl, vertexShader, fragmentShader);
        gl.useProgram(program);

        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

        const uniforms = {
            texture: gl.getUniformLocation(program, 'u_texture'),
            colorMode: gl.getUniformLocation(program, 'u_colorMode'),
            contrast: gl.getUniformLocation(program, 'u_contrast'),
            brightness: gl.getUniformLocation(program, 'u_brightness'),
            saturationBoost: gl.getUniformLocation(program, 'u_saturationBoost'),
            sharpness: gl.getUniformLocation(program, 'u_sharpness'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            uvCrop: gl.getUniformLocation(program, 'u_uvCrop')
        };

        if (side === 'left') { this.leftUniforms = uniforms; } else { this.rightUniforms = uniforms; }

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        if (side === 'left') { this.leftTexture = texture; } else { this.rightTexture = texture; }

        return program;
    }

    createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    initEventListeners() {
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.sharpnessUpBtn.addEventListener('click', () => this.increaseSharpness());
        this.sharpnessDownBtn.addEventListener('click', () => this.decreaseSharpness());
        if (this.colorModeSelect) {
            this.colorModeSelect.addEventListener('change', (e) => {
                this.colorMode = parseInt(e.target.value, 10);
                this.showControls();
            });
        }

        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());

        const handleInteraction = (event) => {
            this.showControls();

            if (event.type === 'click' && !event.target.closest('button') && !event.target.closest('select')) {
                 this.handleScreenTap(event);
            }
        };

        document.addEventListener('mousemove', () => this.showControls());
        document.addEventListener('touchstart', () => this.showControls());
    document.addEventListener('click', handleInteraction);
    window.addEventListener('resize', () => this.handleResize());
    }

    async launchApp() {
        if (this.welcomeOverlay) {
            this.welcomeOverlay.classList.add('hidden');
        }
        await this.startCamera();
        setTimeout(() => { this.enterFullscreen(); }, 1000);
        this.hideControlsAfterDelay();
    }

    async startCamera() {
        try {
            this.showLoading();
            this.hideError();

            const constraints = {
                video: {
                    width: { ideal: 1280, max: 1280 },
                    height: { ideal: 720, max: 720 },
                    facingMode: 'environment',
                    frameRate: { ideal: 30, max: 30 }
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.cameraVideo.srcObject = this.stream;

            this.cameraVideo.addEventListener('loadedmetadata', () => {
                this.updateLayoutForOrientation();
                this.updateCanvasAndViewportSizes();
                this.uvCrop = this.computeUvCrop();
                this.startProcessing();
            });

            this.showVRView();
            this.updateButtonStates(true);
            this.isRunning = true;

        } catch (err) {
            console.error('Error accessing camera:', err);
            this.showError(`Camera access failed: ${err.message}`);
            this.hideLoading();
        }
    }

    startProcessing() {
        this.processFrame();
    }

    processFrame() {
        if (!this.isRunning || !this.leftGl || !this.rightGl) return;

        if (this.cameraVideo.videoWidth === 0) {
            requestAnimationFrame(() => this.processFrame());
            return;
        }

        const now = performance.now();
        const timeSinceLastFrame = now - this.lastFrameTime;
        const targetFrameTime = 1000 / this.targetFPS;

        if (timeSinceLastFrame < targetFrameTime) {
            requestAnimationFrame(() => this.processFrame());
            return;
        }

        this.lastFrameTime = now;

        try {
            this.renderWithWebGL();
        } catch (error) {
            console.error('WebGL rendering error:', error);
            this.clearCanvases();
        }

        requestAnimationFrame(() => this.processFrame());
    }

    renderWithWebGL() {
        if (this.leftGl && this.leftProgram) {
            this.updateVideoTexture(this.leftGl, this.leftTexture);
            this.renderToCanvas(this.leftGl, this.leftUniforms, this.leftProgram);
        }
        if (!this.singleView && this.rightGl && this.rightProgram) {
            this.updateVideoTexture(this.rightGl, this.rightTexture);
            this.renderToCanvas(this.rightGl, this.rightUniforms, this.rightProgram);
        }
    }

    updateVideoTexture(gl, texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cameraVideo);
    }

    renderToCanvas(gl, uniforms, program) {
        gl.useProgram(program);
        gl.uniform1i(uniforms.colorMode, this.colorMode);
        gl.uniform1f(uniforms.contrast, 1.2);
        gl.uniform1f(uniforms.brightness, 0.02);
        gl.uniform1f(uniforms.saturationBoost, 1.1);
        gl.uniform1f(uniforms.sharpness, this.sharpnessLevel);
        gl.uniform2f(uniforms.resolution, this.cameraVideo.videoWidth, this.cameraVideo.videoHeight);
        gl.uniform4f(uniforms.uvCrop, this.uvCrop[0], this.uvCrop[1], this.uvCrop[2], this.uvCrop[3]);
        gl.uniform1i(uniforms.texture, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    clearCanvases() {
        const clear = (gl) => {
            if (gl) {
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        };
        clear(this.leftGl);
        clear(this.rightGl);
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.cameraVideo.srcObject = null;
        this.clearCanvases();
        this.hideVRView();
        this.updateButtonStates(false);
        this.isRunning = false;
    }

    handleScreenTap(event) {
        event.preventDefault();
        if (this.isProcessingFrame) {
            console.log('⏳ Already processing a frame, please wait...');
            return;
        }
        this.captureAndDescribeFrame();
    }

    async captureAndDescribeFrame() {
        if (!this.cameraVideo || this.cameraVideo.videoWidth === 0) {
            console.error('❌ Camera not ready for frame capture.');
            return;
        }

        this.isProcessingFrame = true;
        console.log('📸 Capturing frame for description...');

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.cameraVideo.videoWidth;
            tempCanvas.height = this.cameraVideo.videoHeight;
            const tempCtx = tempCanvas.getContext('2d');

            tempCtx.drawImage(this.cameraVideo, 0, 0);

            const imageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);

            const response = await this.makeApiRequest(imageDataUrl);

            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }

            const data = await response.json();
            const description = data.choices?.[0]?.message?.content || 'No description available';

            console.log('📝 Description:', description);

            await this.speakText(description);

        } catch (error) {
            console.error('❌ Error in description process:', error);
            this.playFallbackSound();
        } finally {
            this.isProcessingFrame = false;
        }
    }

    async makeApiRequest(imageDataUrl, retryCount = 0) {
        try {
            console.log(`🔄 API attempt ${retryCount + 1}/${this.maxRetries + 1}`);

            const headers = {
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Cardboard Camera VR'
            };
            if (this.openRouterKey) {

                headers['Authorization'] = `Bearer ${this.openRouterKey}`;
            }

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: 'meta-llama/llama-4-maverick:free',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Describe what you see in this image in one concise sentence.'
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: imageDataUrl
                                    }
                                }
                            ]
                        }
                    ]
                }),
                signal: AbortSignal.timeout(30000) 
            });
            return response;
        } catch (error) {
            console.error(`❌ API attempt ${retryCount + 1} failed:`, error);
            if (retryCount < this.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.makeApiRequest(imageDataUrl, retryCount + 1);
            }
            throw error;
        }
    }

    playFallbackSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('❌ Error playing fallback sound:', error);
        }
    }

    async speakText(text) {
        return new Promise((resolve, reject) => {
            if (!('speechSynthesis' in window)) {
                console.error('❌ Speech synthesis not supported');
                reject(new Error('Speech synthesis not supported'));
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.lang = 'en-US';

            utterance.onend = () => {
                console.log('✅ Speech finished');
                resolve();
            };

            utterance.onerror = (event) => {
                console.error('❌ Speech error:', event);
                reject(event);
            };

            window.speechSynthesis.speak(utterance);
        });
    }

    toggleFullscreen() {
        if (!this.isFullscreen()) this.enterFullscreen();
        else this.exitFullscreen();
    }

    isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    enterFullscreen() {
        const element = document.documentElement;
        if (element.requestFullscreen) element.requestFullscreen().catch(() => this.fallbackFullscreen());
        else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
    }

    exitFullscreen() {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }

    fallbackFullscreen() {
        this.vrView.classList.add('fullscreen');
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    }

    handleFullscreenChange() {
        this.vrView.classList.toggle('fullscreen', this.isFullscreen());
    }

    handleResize() {
        this.updateLayoutForOrientation();
        this.updateCanvasAndViewportSizes();
        this.uvCrop = this.computeUvCrop();
    }

    updateCanvasAndViewportSizes() {
        const isPortrait = window.innerHeight >= window.innerWidth;
        this.singleView = isPortrait;
        if (this.singleView) {
            const size = Math.min(window.innerWidth, window.innerHeight);
            this.leftCanvas.width = size;
            this.leftCanvas.height = size;
            if (this.leftGl) this.leftGl.viewport(0, 0, size, size);

            this.rightCanvas.width = 1;
            this.rightCanvas.height = 1;
            if (this.rightGl) this.rightGl.viewport(0, 0, 1, 1);
        } else {
            const size = Math.min(window.innerWidth / 2, window.innerHeight);
            this.leftCanvas.width = size;
            this.leftCanvas.height = size;
            this.rightCanvas.width = size;
            this.rightCanvas.height = size;
            if (this.leftGl) this.leftGl.viewport(0, 0, size, size);
            if (this.rightGl) this.rightGl.viewport(0, 0, size, size);
        }
    }

    computeUvCrop() {
        const vw = this.cameraVideo.videoWidth || 0;
        const vh = this.cameraVideo.videoHeight || 0;
        if (!vw || !vh) return [0, 0, 1, 1];
        const ar = vw / vh; 
        if (ar > 1.0) {

            const widthFrac = 1.0 / ar; 
            const u0 = (1.0 - widthFrac) * 0.5;
            return [u0, 0.0, 1.0 - u0, 1.0];
        } else if (ar < 1.0) {

            const heightFrac = ar; 
            const v0 = (1.0 - heightFrac) * 0.5;
            return [0.0, v0, 1.0, 1.0 - v0];
        } else {
            return [0.0, 0.0, 1.0, 1.0];
        }
    }

    updateLayoutForOrientation() {
        const isPortrait = window.innerHeight >= window.innerWidth;
        this.singleView = isPortrait;
        if (this.vrView) {
            this.vrView.classList.toggle('single-view', this.singleView);
        }
    }

    updateButtonStates(isRunning) {
        const buttons = [this.stopBtn, this.fullscreenBtn, this.zoomInBtn, this.zoomOutBtn, this.sharpnessUpBtn, this.sharpnessDownBtn];
        buttons.forEach(btn => btn.disabled = !isRunning);
    }

    zoomIn() { this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel + 0.2); }
    zoomOut() { this.zoomLevel = Math.max(this.minZoom, this.zoomLevel - 0.2); }

    increaseSharpness() {
        this.sharpnessLevel = Math.min(this.maxSharpness, this.sharpnessLevel + 0.2);
        this.updateSharpnessIndicator();
    }

    decreaseSharpness() {
        this.sharpnessLevel = Math.max(this.minSharpness, this.sharpnessLevel - 0.2);
        this.updateSharpnessIndicator();
    }

    updateSharpnessIndicator() {
        const display = Math.round(((this.sharpnessLevel - this.minSharpness) / (this.maxSharpness - this.minSharpness)) * 9 + 1);
        this.sharpnessIndicator.textContent = `Sharp: ${display}/10`;
    }

    showControls() {
        this.controls.classList.remove('hidden');
        this.zoomControls.classList.remove('hidden');
        this.hideControlsAfterDelay();
    }

    hideControlsAfterDelay() {
        if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            this.controls.classList.add('hidden');
            this.zoomControls.classList.add('hidden');
        }, 3000);
    }

    showLoading() { this.loading.classList.remove('hidden'); }
    hideLoading() { this.loading.classList.add('hidden'); }
    showError(msg) { this.error.textContent = msg; this.error.classList.remove('hidden'); }
    hideError() { this.error.classList.add('hidden'); }
    showVRView() { this.vrView.classList.remove('hidden'); this.hideLoading(); }
    hideVRView() { this.vrView.classList.add('hidden'); }
}

document.addEventListener('DOMContentLoaded', () => {
    new ColorShiftVR();
});

window.addEventListener('orientationchange', () => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then((reg) => console.log('Service worker registered.', reg))
            .catch((err) => console.warn('Service worker registration failed:', err));
    });
}
