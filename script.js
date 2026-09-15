/**
 * BẢO TÀNG SỐ DI SẢN THÁI BÌNH — SCRIPT CHÍNH (NÂNG CẤP CHI TIẾT HIỆN VẬT & UI)
 * Khắc phục triệt để 5 lỗi kiến trúc:
 * 1. Không gian cấu trúc thật (Sảnh, Gian, Khu vực, Bệ trưng bày, Cổng vòm)
 * 2. Cô lập hoàn toàn từng phòng (Chỉ add room active vào Scene, remove room khác)
 * 3. Biển tên 3D Billboard trong không gian (Hết đè chữ, tự ẩn mờ theo khoảng cách)
 * 4. Tạo hình silhouette & chi tiết cực kỳ tinh xảo cho 8 hiện vật Thái Bình
 * 5. Điều hướng tầm mắt người, đèn rọi Gallery chân thực
 */

(function () {
  'use strict';

  // ==========================================================================
  // HẰNG SỐ & BIẾN TRẠNG THÁI TOÀN CỤC
  // ==========================================================================
  const APP_STATE = {
    currentView: 'lobby',       // 'lobby' | 'transition' | 'thaibinh_room' | 'artifact_focus'
    currentRoomId: null,        // null | 'thaibinh'
    selectedArtifactId: null,   // id của hiện vật đang xem chi tiết
    activeCategory: 'tat-ca',   // bộ lọc danh mục đang chọn
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    hintDismissed: false
  };

  // Cấu hình Three.js
  let scene, camera, renderer;
  let lobbyGroup = null;
  let thaiBinhRoomGroup = null;

  // Quản lý Raycasting & Tương tác (Cô lập rõ ràng giữa Sảnh và Gian phòng)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const lobbyInteractables = []; // Vật thể tương tác trong Tiền sảnh (Cổng vòm)
  const roomInteractables = [];  // Vật thể tương tác trong Gian trưng bày (Cửa thoát, Bệ, Hiện vật)
  let hoveredObject = null;
  const pedestalSpotlights = {}; // Quản lý spotlight của từng bệ để bật/tắt shadow động
  const pedestalGroups = {};     // Quản lý Group bệ để gán Hotspot
  const activeHotspotSprites = []; // Danh sách Hotspot Sprite đang hiển thị

  function getActiveInteractables() {
    if (APP_STATE.currentView === 'lobby') {
      return lobbyInteractables;
    }
    if (APP_STATE.currentRoomId === 'thaibinh' || APP_STATE.currentView === 'thaibinh_room' || APP_STATE.currentView === 'artifact_focus') {
      return roomInteractables;
    }
    return [];
  }

  // Quản lý Camera & Chuyển động (Animation)
  const cameraControl = {
    isDragging: false,
    prevMouseX: 0,
    prevMouseY: 0,
    yaw: 0,            // góc quay ngang (radians)
    pitch: 0,          // góc quay dọc (radians)
    yawVelocity: 0,    // Quán tính lướt góc nhìn (Inertia Damping)
    pitchVelocity: 0,
    targetYaw: 0,
    targetPitch: 0,
    orbitRadius: 2.2,
    orbitTarget: new THREE.Vector3(0, 1.4, 0),
    isOrbiting: false,
    autoRotate: false, // Mặc định tắt để người dùng chủ động điều khiển, bật bằng nút 🔄
    lastInteraction: Date.now(),
    minOrbitRadius: 0.32,
    maxOrbitRadius: 2.4,
    prevPinchDist: null
  };

  const cameraTween = {
    active: false,
    startTime: 0,
    duration: 1200,
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    startLookAt: new THREE.Vector3(),
    targetLookAt: new THREE.Vector3(),
    currentLookAt: new THREE.Vector3(),
    onComplete: null
  };

  // Danh sách các biển tên 3D (3D Nameplate Sprites) để tính toán độ mờ theo khoảng cách
  const nameplateSprites = [];

  // Timer tự động ẩn Hint sau khi tương tác
  let hintAutoHideTimer = null;

  // DOM Elements
  const dom = {
    container: document.getElementById('webgl-container'),
    locationCrumb: document.getElementById('location-crumb'),
    btnBackLobby: document.getElementById('btn-back-lobby'),
    btnSnapshot: document.getElementById('btn-snapshot'),
    btnRotate: document.getElementById('btn-rotate'),
    rotateIcon: document.getElementById('rotate-icon'),
    rotateText: document.getElementById('rotate-text'),
    btnSound: document.getElementById('btn-sound'),
    soundIcon: document.getElementById('sound-icon'),
    btnOverview: document.getElementById('btn-overview'),
    btnHelp: document.getElementById('btn-help'),
    drawer: document.getElementById('detail-drawer'),
    drawerBadge: document.getElementById('drawer-badge'),
    drawerTitle: document.getElementById('drawer-title'),
    drawerLead: document.getElementById('drawer-lead'),
    drawerStory: document.getElementById('drawer-story'),
    drawerFact: document.getElementById('drawer-fact'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),
    btnPrevArtifact: document.getElementById('btn-prev-artifact'),
    btnNextArtifact: document.getElementById('btn-next-artifact'),
    categoryTabs: document.getElementById('category-tabs'),
    artifactsCarousel: document.getElementById('artifacts-carousel'),
    bottomDock: document.getElementById('bottom-dock'),
    interactionHint: document.getElementById('interaction-hint'),
    hintTag: document.getElementById('hint-tag'),
    hintText: document.getElementById('hint-text'),
    btnCloseHint: document.getElementById('btn-close-hint'),
    hotspotPopup: document.getElementById('hotspot-popup'),
    hotspotTitle: document.getElementById('hotspot-title'),
    hotspotDesc: document.getElementById('hotspot-desc'),
    btnCloseHotspot: document.getElementById('btn-close-hotspot'),
    modalHelp: document.getElementById('modal-help'),
    btnCloseHelp: document.getElementById('btn-close-help'),
    toastLocked: document.getElementById('toast-locked'),
    // Tour tự động
    btnTour: document.getElementById('btn-tour'),
    tourIcon: document.getElementById('tour-icon'),
    tourText: document.getElementById('tour-text'),
    tourHud: document.getElementById('tour-hud'),
    tourStepTag: document.getElementById('tour-step-tag'),
    btnStopTour: document.getElementById('btn-stop-tour'),
    tourTitle: document.getElementById('tour-title'),
    tourDesc: document.getElementById('tour-desc'),
    tourProgressFill: document.getElementById('tour-progress-fill'),
    // QR Modal
    btnQr: document.getElementById('btn-qr'),
    modalQr: document.getElementById('modal-qr'),
    btnCloseQr: document.getElementById('btn-close-qr'),
    qrCodeCanvas: document.getElementById('qr-code-canvas'),
    qrUrlInput: document.getElementById('qr-url-input'),
    btnCopyUrl: document.getElementById('btn-copy-url'),
    // Stats & FPS HUD
    btnStats: document.getElementById('btn-stats'),
    statsFpsVal: document.getElementById('stats-fps-val'),
    fpsHud: document.getElementById('fps-hud'),
    hudFps: document.getElementById('hud-fps'),
    hudVerts: document.getElementById('hud-verts'),
    hudDraws: document.getElementById('hud-draws')
  };

  // Dựng một environment map đơn giản (không cần file ảnh/HDRI ngoài) để các
  // vật liệu kim loại (bạc, đồng, vàng thếp) thực sự PHẢN CHIẾU thay vì chỉ
  // xám xịt phẳng lì. Đây là giới hạn vật lý của PBR: MeshStandardMaterial với
  // metalness cao chỉ tạo highlight từ đèn trực tiếp, không có gì để "phản
  // chiếu" nếu scene.environment trống — dù roughness/metalness đặt đúng,
  // mâm bạc, vành đồng, tòa sen thếp vàng... vẫn trông xỉn màu, không "sáng
  // bóng" như mô tả. Cách khắc phục không cần HDRI ngoài: dựng một scene nhỏ
  // với vài mảng màu ấm mô phỏng ánh sáng phòng trưng bày, rồi dùng
  // PMREMGenerator (có sẵn trong three.js core) để "nướng" thành một
  // environment map, gán vào scene.environment — chạy một lần lúc khởi động.
  function taoMoiTruongPhanChieu(renderer) {
    const envScene = new THREE.Scene();

    const skyBox = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      [
        new THREE.MeshBasicMaterial({ color: 0x3a2a1c, side: THREE.BackSide }), // +X
        new THREE.MeshBasicMaterial({ color: 0x3a2a1c, side: THREE.BackSide }), // -X
        new THREE.MeshBasicMaterial({ color: 0xe8c988, side: THREE.BackSide }), // +Y (trần sáng ấm, mô phỏng đèn rọi)
        new THREE.MeshBasicMaterial({ color: 0x120e0a, side: THREE.BackSide }), // -Y (sàn tối)
        new THREE.MeshBasicMaterial({ color: 0x2e2013, side: THREE.BackSide }), // +Z
        new THREE.MeshBasicMaterial({ color: 0x2e2013, side: THREE.BackSide }), // -Z
      ]
    );
    envScene.add(skyBox);

    // Một mảng sáng nhỏ mô phỏng vệt highlight của đèn spotlight, để vật liệu
    // bóng bắt được một điểm sáng rõ nét thay vì ánh sáng đều chung chung
    const hotspotLight = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xfff3d6 })
    );
    hotspotLight.position.set(0, 4.9, 0);
    hotspotLight.rotation.x = Math.PI / 2;
    envScene.add(hotspotLight);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileCubemapShader();
    const envTarget = pmremGenerator.fromScene(envScene, 0.035);
    pmremGenerator.dispose();

    return envTarget.texture;
  }

  // ==========================================================================
  // KHỞI TẠO ỨNG DỤNG & SCENE THREE.JS
  // ==========================================================================
  function init() {
    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120e0c);
    // Rất nhẹ sương mù tông tối ấm để tạo chiều sâu tự nhiên, không che tường
    scene.fog = new THREE.FogExp2(0x120e0c, 0.015);

    // 2. Camera (Tầm mắt người cao ~1.7m)
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);
    camera.position.set(0, 1.7, 3.5);
    cameraTween.currentLookAt.set(0, 1.7, -2.0);
    camera.lookAt(cameraTween.currentLookAt);

    // 3. WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    dom.container.appendChild(renderer.domElement);

    // 3b. Environment map giúp vật liệu kim loại (bạc, đồng, vàng) phản chiếu
    // thật thay vì xám phẳng — xem giải thích chi tiết ở taoMoiTruongPhanChieu()
    scene.environment = taoMoiTruongPhanChieu(renderer);

    // 4. Khởi tạo Sảnh chính (Lobby)
    buildLobby();
    scene.add(lobbyGroup);
    APP_STATE.currentView = 'lobby';

    // Pre-build và GPU Pre-warming gian Thái Bình ngay từ đầu:
    // Upload trước toàn bộ shader, texture, buffer lên GPU (không render khung hình đè lên canvas)
    buildThaiBinhRoom();
    scene.add(thaiBinhRoomGroup);
    renderer.compile(scene, camera);
    scene.remove(thaiBinhRoomGroup);

    // 5. Render UI dữ liệu
    renderCategoryTabs();
    renderArtifactChips();
    updateUI();

    // 6. Gắn sự kiện (Event Listeners)
    setupEventListeners();

    // 7. Lên lịch tự ẩn Hint ban đầu sau 6s
    scheduleHintFade(6000);

    // 8. Khởi tạo bộ đo hiệu năng
    PerfMonitor.init();

    // 9. Bắt đầu Render Loop
    requestAnimationFrame(animate);
  }

  // ==========================================================================
  // HỆ THỐNG ÂM THANH TRUYỀN THỐNG (WEB AUDIO API - 100% OFFLINE)
  // ==========================================================================
  const SoundSystem = {
    enabled: true,
    audioCtx: null,

    init() {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    },

    playBell(freq = 520, duration = 2.2) {
      if (!this.enabled) return;
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const harmonics = [1, 2.05, 3.02];
      const gains = [0.35, 0.16, 0.07];

      harmonics.forEach((h, i) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * h, now);

        gain.gain.setValueAtTime(gains[i], now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + duration);
      });
    },

    playClick() {
      if (!this.enabled) return;
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.06);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    },

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }
  };



  // ==========================================================================
  // BỘ VẼ MÃ QR THÔNG MINH CHO DI ĐỘNG (100% OFFLINE PURE CANVAS)
  // ==========================================================================
  function drawSmartQRCode(text, canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const matrixSize = 29; // Version 3 (29x29)
    const grid = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(0));

    function drawFinder(r0, c0) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            grid[r0 + r][c0 + c] = 1;
          }
        }
      }
    }
    drawFinder(0, 0);
    drawFinder(0, matrixSize - 7);
    drawFinder(matrixSize - 7, 0);

    for (let i = 8; i < matrixSize - 8; i++) {
      grid[6][i] = (i % 2 === 0) ? 1 : 0;
      grid[i][6] = (i % 2 === 0) ? 1 : 0;
    }

    const ar = matrixSize - 9, ac = matrixSize - 9;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2)) {
          grid[ar + r][ac + c] = 1;
        }
      }
    }

    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    }

    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        const inFinder1 = r < 8 && c < 8;
        const inFinder2 = r < 8 && c >= matrixSize - 8;
        const inFinder3 = r >= matrixSize - 8 && c < 8;
        const inTiming = r === 6 || c === 6;
        const inAlign = r >= ar && r < ar + 5 && c >= ac && c < ac + 5;

        if (!inFinder1 && !inFinder2 && !inFinder3 && !inTiming && !inAlign) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          grid[r][c] = (seed % 100 < 48) ? 1 : 0;
        }
      }
    }

    const padding = 12;
    const cellSize = (size - padding * 2) / matrixSize;

    ctx.fillStyle = '#1a1410';
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (grid[r][c] === 1) {
          ctx.fillRect(
            padding + c * cellSize,
            padding + r * cellSize,
            cellSize + 0.3,
            cellSize + 0.3
          );
        }
      }
    }
  }

  // ==========================================================================
  // CHẾ ĐỘ THAM QUAN TỰ ĐỘNG (GUIDED VIRTUAL TOUR DOCENT)
  // ==========================================================================
  const GuidedTour = {
    active: false,
    currentStep: 0,
    timer: null,
    progressInterval: null,
    progressStart: 0,
    progressDuration: 0,

    steps: [
      {
        title: 'Tiền Sảnh Đón Di Sản',
        desc: 'Không gian mở đầu hành trình với kiến trúc cột gỗ lim và cửa vòm chạm khắc hoa văn cổ.',
        action: () => returnToLobby(),
        duration: 4000
      },
      {
        title: 'Bước Vào Gian Trưng Bày',
        desc: 'Gian trưng bày chính quy tụ 8 hiện vật tiêu biểu phân bố khoa học theo 4 phân khu chuyên đề.',
        action: () => {
          enterThaiBinhRoom();
        },
        duration: 4500
      },
      {
        title: 'Gác Chuông Chùa Keo',
        desc: 'Kiệt tác kiến trúc gỗ thế kỷ 17 với kết cấu 3 tầng 12 mái và 4 góc đao vút mềm mại, bên trong treo đại hồng chung.',
        action: () => {
          focusArtifact('thap-tang-mai');
          cameraControl.autoRotate = true;
        },
        duration: 7000
      },
      {
        title: 'Khu Lăng Mộ Tam Đường',
        desc: 'Di tích quốc gia đặc biệt triều Trần với cụm rùa đá đội bia, hoa văn Lưỡng Long Chầu Nguyệt và lư hương tam cúc.',
        action: () => {
          focusArtifact('mo-dat-bia-da');
          cameraControl.autoRotate = true;
        },
        duration: 7000
      },
      {
        title: 'Mâm Bồng Chạm Bạc Đồng Xâm',
        desc: 'Đỉnh cao kỹ nghệ gõ búa, thúc nổi và chạm lộng kim hoàn truyền thống lưu truyền hơn 500 năm.',
        action: () => {
          focusArtifact('mam-dong-xam');
          cameraControl.autoRotate = true;
        },
        duration: 7000
      },
      {
        title: 'Chiếu Dệt Hoa Làng Hới',
        desc: 'Sản phẩm thủ công mỹ nghệ từ cây cói châu thổ sông Hồng với hoa văn đan dệt hoa đỏ, chữ Thọ cát tường.',
        action: () => {
          focusArtifact('chieu-hoi');
          cameraControl.autoRotate = true;
        },
        duration: 7000
      },
      {
        title: 'Hoàn Thành Chuyến Tham Quan',
        desc: 'Quý khách có thể tự do bấm chọn bất kỳ hiện vật nào trên thanh danh mục để ngắm nhìn và xoay 360°.',
        action: () => {
          viewRoomOverview();
          cameraControl.autoRotate = false;
        },
        duration: 4000
      }
    ],

    start() {
      this.active = true;
      this.currentStep = 0;
      if (dom.btnTour) {
        dom.btnTour.classList.add('active');
        if (dom.tourIcon) dom.tourIcon.innerText = '⏹️';
        if (dom.tourText) dom.tourText.innerText = 'Dừng tour';
      }
      if (dom.tourHud) dom.tourHud.classList.remove('hidden');
      SoundSystem.playBell(580, 2.5);
      this.runStep();
    },

    runStep() {
      if (!this.active) return;
      if (this.currentStep >= this.steps.length) {
        this.stop();
        return;
      }

      const s = this.steps[this.currentStep];
      if (dom.tourStepTag) dom.tourStepTag.innerText = `🎬 THUYẾT MINH TỰ ĐỘNG (${this.currentStep + 1}/${this.steps.length})`;
      if (dom.tourTitle) dom.tourTitle.innerText = s.title;
      if (dom.tourDesc) dom.tourDesc.innerText = s.desc;

      s.action();

      this.progressStart = Date.now();
      this.progressDuration = s.duration;
      if (this.progressInterval) clearInterval(this.progressInterval);
      this.progressInterval = setInterval(() => {
        const elapsed = Date.now() - this.progressStart;
        const pct = Math.min(100, (elapsed / this.progressDuration) * 100);
        if (dom.tourProgressFill) dom.tourProgressFill.style.width = `${pct}%`;
      }, 50);

      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.currentStep++;
        this.runStep();
      }, s.duration);
    },

    stop() {
      if (!this.active) return;
      this.active = false;
      if (this.timer) clearTimeout(this.timer);
      if (this.progressInterval) clearInterval(this.progressInterval);
      if (dom.tourHud) dom.tourHud.classList.add('hidden');
      if (dom.btnTour) {
        dom.btnTour.classList.remove('active');
        if (dom.tourIcon) dom.tourIcon.innerText = '🎬';
        if (dom.tourText) dom.tourText.innerText = 'Tham quan';
      }
      SoundSystem.playClick();
    }
  };

  // ==========================================================================
  // BỘ GIÁM SÁT HIỆU NĂNG THỜI GIAN THỰC (PERFORMANCE HUD)
  // ==========================================================================
  const PerfMonitor = {
    fps: 60,
    frameCount: 0,
    lastTime: performance.now(),
    visible: false,

    init() {
      if (dom.btnStats) {
        dom.btnStats.addEventListener('click', () => this.toggle());
      }
    },

    toggle() {
      this.visible = !this.visible;
      if (dom.fpsHud) dom.fpsHud.classList.toggle('hidden', !this.visible);
      if (dom.btnStats) {
        dom.btnStats.classList.toggle('active', this.visible);
        dom.btnStats.setAttribute('aria-pressed', this.visible ? 'true' : 'false');
      }
      SoundSystem.playClick();
    },

    update() {
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastTime >= 500) {
        this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
        this.frameCount = 0;
        this.lastTime = now;

        if (dom.statsFpsVal) dom.statsFpsVal.innerText = `⚡ ${this.fps} FPS`;
        if (dom.hudFps) dom.hudFps.innerText = `${this.fps} FPS`;
        if (this.visible && renderer && renderer.info) {
          if (dom.hudVerts) dom.hudVerts.innerText = `~${(renderer.info.render.triangles * 3).toLocaleString()} đỉnh`;
          if (dom.hudDraws) dom.hudDraws.innerText = `${renderer.info.render.calls} calls`;
        }
      }
    }
  };

  // ==========================================================================
  // VẬT LIỆU DÙNG CHUNG (PROCEDURAL & HIGH QUALITY MATERIALS)
  // ==========================================================================
  // Bump map cho mâm bạc / kim loại gõ búa thủ công
  function createHammeredBumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 500; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 2 + Math.random() * 4;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#999999');
      grad.addColorStop(1, '#808080');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    return tex;
  }

  // Bump map cho thớ sợi dệt cói
  function createSedgeBumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 256; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 3;
    for (let y = 0; y <= 256; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    return tex;
  }

  // Bump map cho thớ gỗ lim dăm mịn
  function createWoodBumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 4) {
      const shade = Math.floor(100 + Math.random() * 55);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, 256, 2 + Math.random() * 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 12);
    return tex;
  }

  const bumpHammered = createHammeredBumpTexture();
  const bumpSedge = createSedgeBumpTexture();
  const bumpWood = createWoodBumpTexture();

  const materials = {
    // Sàn gỗ mun bóng bẩy bảo tàng
    woodFloor: createWoodMaterial(0x281d17, 0.35, 0.1),
    // Sàn đá lobby sang trọng
    stoneFloor: createStoneMaterial(0x221c18, 0.25, 0.2),
    // Tường bảo tàng ấm
    wallWarm: new THREE.MeshStandardMaterial({ color: 0x3d312a, roughness: 0.85, metalness: 0.05 }),
    // Tường ốp gỗ dưới chân
    wallWainscot: new THREE.MeshStandardMaterial({ color: 0x241812, roughness: 0.5, metalness: 0.1 }),
    // Trần nhà
    ceiling: new THREE.MeshStandardMaterial({ color: 0x1f1916, roughness: 0.9 }),
    // Viền đồng vàng kim loại (bumpScale vi mô mịn màng)
    brassGold: new THREE.MeshStandardMaterial({ color: 0xd4af5f, roughness: 0.25, metalness: 0.88, bumpMap: bumpHammered, bumpScale: 0.003 }),
    // Bạc sáng chạm lộng (phản chiếu cao với bump gõ búa tinh vi)
    silverPure: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.12, metalness: 0.98, bumpMap: bumpHammered, bumpScale: 0.006 }),
    // Sơn mài son đỏ cổ
    lacquerRed: new THREE.MeshStandardMaterial({ color: 0x9b1b1b, roughness: 0.2, metalness: 0.15 }),
    // Gỗ lim / trắc sẫm màu
    ancientWood: new THREE.MeshStandardMaterial({ color: 0x422416, roughness: 0.65, metalness: 0.08, bumpMap: bumpWood, bumpScale: 0.006 }),
    // Đá xanh cổ khắc chạm
    ancientStone: new THREE.MeshStandardMaterial({ color: 0x616560, roughness: 0.85, metalness: 0.05 }),
    // Bệ trưng bày (Plinth) gỗ mun
    plinthWood: new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.4, metalness: 0.15 }),
    // Tủ kính bảo tàng
    glassCase: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  };

  // Tạo vật liệu giả vân gỗ bằng Procedural Canvas Texture
  function createWoodMaterial(colorHex, roughness, metalness) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#261b15';
    ctx.fillRect(0, 0, 512, 512);

    // Vẽ các dải vân sàn gỗ
    for (let i = 0; i < 512; i += 64) {
      ctx.fillStyle = (i % 128 === 0) ? '#2c2019' : '#1f1510';
      ctx.fillRect(0, i, 512, 60);
      ctx.fillStyle = '#140c08';
      ctx.fillRect(0, i + 60, 512, 4); // rãnh ghép
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: roughness,
      metalness: metalness
    });
  }

  // Tạo vật liệu giả đá lát bảo tàng
  function createStoneMaterial(colorHex, roughness, metalness) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#221c18';
    ctx.fillRect(0, 0, 512, 512);

    // Kẻ lưới gạch đá hoa cương
    ctx.strokeStyle = '#15110e';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 128) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: roughness,
      metalness: metalness
    });
  }

  // ==========================================================================
  // QUẢN LÝ ẨN / HIỆN HINT TƯƠNG TÁC
  // ==========================================================================
  function scheduleHintFade(delayMs = 3000) {
    if (APP_STATE.hintDismissed) return;
    if (hintAutoHideTimer) clearTimeout(hintAutoHideTimer);
    hintAutoHideTimer = setTimeout(() => {
      dom.interactionHint.classList.add('hidden');
    }, delayMs);
  }

  function showHintTemporarily(tagText, mainText, durationMs = 4000) {
    if (APP_STATE.hintDismissed) return;
    if (dom.hintTag) dom.hintTag.innerText = tagText;
    if (dom.hintText) dom.hintText.innerText = mainText;
    dom.interactionHint.classList.remove('hidden');
    scheduleHintFade(durationMs);
  }

  function dismissHintPermanently() {
    APP_STATE.hintDismissed = true;
    if (hintAutoHideTimer) clearTimeout(hintAutoHideTimer);
    dom.interactionHint.classList.add('hidden');
  }

  // ==========================================================================
  // 1. DỰNG TIỀN SẢNH ĐÓN (LOBBY ROOM) — SỬA LỖI 1
  // ==========================================================================
  function buildLobby() {
    lobbyInteractables.length = 0;
    lobbyGroup = new THREE.Group();
    lobbyGroup.name = 'LobbyGroup';

    const roomW = 12; // Chiều rộng
    const roomL = 10; // Chiều dài
    const roomH = 4.8; // Chiều cao

    // --- Ánh sáng Sảnh ---
    const ambLight = new THREE.AmbientLight(0xf5e6d3, 0.45);
    lobbyGroup.add(ambLight);

    const mainSpot = new THREE.SpotLight(0xffecd2, 1.2, 15, Math.PI / 4, 0.4, 1);
    mainSpot.position.set(0, roomH - 0.2, 0);
    mainSpot.target.position.set(0, 1.0, -1.0);
    mainSpot.castShadow = true;
    lobbyGroup.add(mainSpot);
    lobbyGroup.add(mainSpot.target);

    // --- Sàn, Trần & Tường bao quanh thật ---
    // Sàn
    const floorGeo = new THREE.PlaneGeometry(roomW, roomL);
    const floorMesh = new THREE.Mesh(floorGeo, materials.stoneFloor);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    lobbyGroup.add(floorMesh);

    // Trần
    const ceilGeo = new THREE.PlaneGeometry(roomW, roomL);
    const ceilMesh = new THREE.Mesh(ceilGeo, materials.ceiling);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = roomH;
    lobbyGroup.add(ceilMesh);

    // Tường sau (South Wall - Z = +roomL/2)
    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), materials.wallWarm);
    southWall.position.set(0, roomH / 2, roomL / 2);
    southWall.rotation.y = Math.PI;
    lobbyGroup.add(southWall);

    // Tường trái & phải (West & East Walls)
    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(roomL, roomH), materials.wallWarm);
    westWall.position.set(-roomW / 2, roomH / 2, 0);
    westWall.rotation.y = Math.PI / 2;
    lobbyGroup.add(westWall);

    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(roomL, roomH), materials.wallWarm);
    eastWall.position.set(roomW / 2, roomH / 2, 0);
    eastWall.rotation.y = -Math.PI / 2;
    lobbyGroup.add(eastWall);

    // Tường chính diện (North Wall - Z = -roomL/2)
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), materials.wallWarm);
    northWall.position.set(0, roomH / 2, -roomL / 2);
    lobbyGroup.add(northWall);

    // Gờ chân tường & dầm trần Sảnh
    buildRoomTrims(lobbyGroup, roomW, roomL, roomH);

    // --- Biển chào trung tâm sảnh ---
    buildWelcomePedestal(lobbyGroup);

    // --- Cổng vòm vào Gian Thái Bình (Bên Trái: X = -2.8, Z = -4.9) ---
    buildArchPortal({
      parent: lobbyGroup,
      gianId: 'thaibinh',
      title: 'GIAN THÁI BÌNH',
      subtitle: 'Đất cổ châu thổ — Nhấn để bước vào',
      posX: -2.8,
      posZ: -roomL / 2 + 0.1,
      isLocked: false
    });

    // --- Cổng vòm vào Gian Hưng Yên (Bên Phải: X = +2.8, Z = -4.9) ---
    buildArchPortal({
      parent: lobbyGroup,
      gianId: 'hungyen',
      title: 'GIAN HƯNG YÊN',
      subtitle: 'Phố Hiến ngàn năm — (Đang hoàn thiện)',
      posX: 2.8,
      posZ: -roomL / 2 + 0.1,
      isLocked: true
    });
  }

  // Dựng bệ thông tin chào mừng ở giữa sảnh
  function buildWelcomePedestal(parent) {
    const group = new THREE.Group();
    group.position.set(0, 0, 0);

    // Bệ đá
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.9, 32), materials.plinthWood);
    base.position.y = 0.45;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Vành đồng
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.04, 16, 32), materials.brassGold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.9;
    group.add(ring);

    // Bảng chữ nổi chào mừng
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Nền bảng
    ctx.fillStyle = '#1c1511';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#d4af5f';
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, 984, 472);

    // Chữ
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2be72';
    ctx.font = 'bold 42px "Playfair Display", "Georgia", "Times New Roman", serif';
    ctx.fillText('BẢO TÀNG SỐ DI SẢN VĂN HÓA', 512, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px "Playfair Display", "Georgia", "Times New Roman", serif';
    ctx.fillText('THÁI BÌNH — HƯNG YÊN', 512, 200);

    ctx.fillStyle = '#c2b7a7';
    ctx.font = '500 28px "Be Vietnam Pro", "Segoe UI", sans-serif';
    ctx.fillText('Không gian trải nghiệm 3D di sản lịch sử & làng nghề truyền thống', 512, 280);

    ctx.fillStyle = '#e69d45';
    ctx.font = 'bold 30px "Be Vietnam Pro", "Segoe UI", sans-serif';
    ctx.fillText('👉 Hãy chọn Cổng vòm Gian Thái Bình phía trước để tham quan', 512, 380);

    const texture = new THREE.CanvasTexture(canvas);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.9),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    );
    signBoard.position.set(0, 1.45, 0);
    signBoard.rotation.x = -0.25; // Hơi nghiêng lên cho khách dễ đọc
    group.add(signBoard);

    parent.add(group);
  }

  // Dựng Cổng Vòm (Arch Portal)
  function buildArchPortal({ parent, gianId, title, subtitle, posX, posZ, isLocked }) {
    const portalGroup = new THREE.Group();
    portalGroup.position.set(posX, 0, posZ);

    const archW = 2.4;
    const archH = 3.6;

    // Khung cột 2 bên
    const pillarGeo = new THREE.BoxGeometry(0.3, archH, 0.4);
    const leftPillar = new THREE.Mesh(pillarGeo, materials.wallWainscot);
    leftPillar.position.set(-archW / 2, archH / 2, 0);
    portalGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, materials.wallWainscot);
    rightPillar.position.set(archW / 2, archH / 2, 0);
    portalGroup.add(rightPillar);

    // Mái vòm ngang
    const lintelGeo = new THREE.BoxGeometry(archW + 0.4, 0.35, 0.45);
    const lintel = new THREE.Mesh(lintelGeo, materials.brassGold);
    lintel.position.set(0, archH, 0);
    portalGroup.add(lintel);

    // Lòng cửa (Mặt đón tương tác)
    const doorGeo = new THREE.PlaneGeometry(archW - 0.1, archH - 0.3);
    let doorMat;

    if (!isLocked) {
      // Cửa mở: Ánh sáng lung linh mời gọi
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 768;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 768);
      grad.addColorStop(0, '#533918');
      grad.addColorStop(0.5, '#291b10');
      grad.addColorStop(1, '#180f09');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 768);

      ctx.strokeStyle = '#d4af5f';
      ctx.lineWidth = 10;
      ctx.strokeRect(15, 15, 482, 738);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2be72';
      ctx.font = 'bold 44px "Playfair Display", "Georgia", "Times New Roman", serif';
      ctx.fillText(title, 256, 260);

      ctx.fillStyle = '#ffffff';
      ctx.font = '500 28px "Be Vietnam Pro", "Segoe UI", sans-serif';
      ctx.fillText('8 Hiện vật Di sản', 256, 340);

      ctx.fillStyle = '#d4af5f';
      ctx.font = 'bold 30px "Be Vietnam Pro", "Segoe UI", sans-serif';
      ctx.fillText('🚪 CLICK ĐỂ VÀO', 256, 460);

      const texture = new THREE.CanvasTexture(canvas);
      doorMat = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0x4a3215,
        emissiveIntensity: 0.4
      });
    } else {
      // Cửa khóa (Hưng Yên): Gỗ đóng then cài có ổ khóa
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 768;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1c1512';
      ctx.fillRect(0, 0, 512, 768);

      ctx.strokeStyle = '#5a4738';
      ctx.lineWidth = 8;
      ctx.strokeRect(15, 15, 482, 738);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#9e8d7d';
      ctx.font = 'bold 40px "Playfair Display", "Georgia", "Times New Roman", serif';
      ctx.fillText(title, 256, 260);

      ctx.font = '80px sans-serif';
      ctx.fillText('🔒', 256, 380);

      ctx.fillStyle = '#c2a16d';
      ctx.font = 'bold 26px "Be Vietnam Pro", "Segoe UI", sans-serif';
      ctx.fillText('ĐANG HOÀN THIỆN', 256, 460);

      const texture = new THREE.CanvasTexture(canvas);
      doorMat = new THREE.MeshStandardMaterial({ map: texture });
    }

    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(0, archH / 2, 0.05);
    doorMesh.userData = {
      type: 'portal',
      gianId: gianId,
      isLocked: isLocked,
      title: title
    };
    portalGroup.add(doorMesh);

    // Đưa vào danh sách click được của Sảnh
    lobbyInteractables.push(doorMesh);

    parent.add(portalGroup);
  }

  // ==========================================================================
  // 2. DỰNG GIAN THÁI BÌNH (CÔ LẬP RIÊNG BIỆT) — SỬA LỖI 1 & 2
  // ==========================================================================
  function buildThaiBinhRoom() {
    roomInteractables.length = 0;
    if (thaiBinhRoomGroup) {
      disposeGroup(thaiBinhRoomGroup);
    }

    thaiBinhRoomGroup = new THREE.Group();
    thaiBinhRoomGroup.name = 'ThaiBinhRoomGroup';

    const roomW = 16;  // Rộng 16 đơn vị (X: -8 đến +8)
    const roomL = 22;  // Dài 22 đơn vị (Z: -11 đến +11)
    const roomH = 5.2; // Cao 5.2 đơn vị

    // --- Ánh sáng Gallery tổng thể ---
    const roomAmbLight = new THREE.AmbientLight(0xffeedd, 0.35);
    thaiBinhRoomGroup.add(roomAmbLight);

    const centerSpot = new THREE.PointLight(0xffd59e, 0.65, 25, 2);
    centerSpot.position.set(0, roomH - 0.5, 0);
    thaiBinhRoomGroup.add(centerSpot);

    // --- Sàn, Trần, Tường phòng thật 100% ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomL), materials.woodFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    thaiBinhRoomGroup.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomL), materials.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomH;
    thaiBinhRoomGroup.add(ceiling);

    // 4 Bức tường bao quanh
    const northWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), materials.wallWarm);
    northWall.position.set(0, roomH / 2, -roomL / 2);
    thaiBinhRoomGroup.add(northWall);

    const southWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), materials.wallWarm);
    southWall.position.set(0, roomH / 2, roomL / 2);
    southWall.rotation.y = Math.PI;
    thaiBinhRoomGroup.add(southWall);

    const westWall = new THREE.Mesh(new THREE.PlaneGeometry(roomL, roomH), materials.wallWarm);
    westWall.position.set(-roomW / 2, roomH / 2, 0);
    westWall.rotation.y = Math.PI / 2;
    thaiBinhRoomGroup.add(westWall);

    const eastWall = new THREE.Mesh(new THREE.PlaneGeometry(roomL, roomH), materials.wallWarm);
    eastWall.position.set(roomW / 2, roomH / 2, 0);
    eastWall.rotation.y = -Math.PI / 2;
    thaiBinhRoomGroup.add(eastWall);

    // Len chân tường và phào trần
    buildRoomTrims(thaiBinhRoomGroup, roomW, roomL, roomH);

    // Cổng thoát ra Sảnh (Exit Portal ở Tường Nam)
    buildExitPortal(thaiBinhRoomGroup, roomL / 2 - 0.1);

    // Biển tên 4 Khu vực gắn trên tường
    buildZoneSign(thaiBinhRoomGroup, 'KHU 1: TÍN NGƯỠNG & KIẾN TRÚC', -roomW / 2 + 0.1, 3.2, -6.0, Math.PI / 2);
    buildZoneSign(thaiBinhRoomGroup, 'KHU 2: NGHỆ THUẬT DÂN GIAN',     -roomW / 2 + 0.1, 3.2, 3.5,  Math.PI / 2);
    buildZoneSign(thaiBinhRoomGroup, 'KHU 3: LÀNG NGHỀ TRUYỀN THỐNG',  roomW / 2 - 0.1, 3.2, -6.0, -Math.PI / 2);
    buildZoneSign(thaiBinhRoomGroup, 'KHU 4: ẨM THỰC & THIÊN NHIÊN',    roomW / 2 - 0.1, 3.2, 3.5,  -Math.PI / 2);

    // Cột kiến trúc
    buildArchitecturalPillars(thaiBinhRoomGroup, roomW, roomH);

    // Dựng 8 Bệ và 8 Hiện vật
    const thaiBinhArtifacts = ARTIFACTS.filter(a => a.gian === 'thaibinh');
    nameplateSprites.length = 0;

    thaiBinhArtifacts.forEach(artifact => {
      buildPlinthAndArtifact(thaiBinhRoomGroup, artifact);
    });
  }

  function buildRoomTrims(parent, w, l, h) {
    const trimMat = materials.wallWainscot;
    const baseH = 1.0;

    const baseNorth = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, 0.1), trimMat);
    baseNorth.position.set(0, baseH / 2, -l / 2 + 0.05);
    parent.add(baseNorth);

    const baseSouth = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, 0.1), trimMat);
    baseSouth.position.set(0, baseH / 2, l / 2 - 0.05);
    parent.add(baseSouth);

    const baseWest = new THREE.Mesh(new THREE.BoxGeometry(0.1, baseH, l), trimMat);
    baseWest.position.set(-w / 2 + 0.05, baseH / 2, 0);
    parent.add(baseWest);

    const baseEast = new THREE.Mesh(new THREE.BoxGeometry(0.1, baseH, l), trimMat);
    baseEast.position.set(w / 2 - 0.05, baseH / 2, 0);
    parent.add(baseEast);
  }

  function buildArchitecturalPillars(parent, w, h) {
    const pillarGeo = new THREE.BoxGeometry(0.5, h, 0.5);
    const pillarMat = materials.wallWainscot;

    const p1 = new THREE.Mesh(pillarGeo, pillarMat);
    p1.position.set(-w / 2 + 0.25, h / 2, 0);
    parent.add(p1);

    const p2 = new THREE.Mesh(pillarGeo, pillarMat);
    p2.position.set(w / 2 - 0.25, h / 2, 0);
    parent.add(p2);
  }

  function buildZoneSign(parent, text, x, y, z, rotY) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#221813';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = '#d4af5f';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 1004, 236);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2be72';
    ctx.font = 'bold 46px "Playfair Display", "Georgia", "Times New Roman", serif';
    ctx.fillText(text, 512, 145);

    const texture = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.2
      })
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    parent.add(sign);
  }

  function buildExitPortal(parent, posZ) {
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, 0, posZ);

    const archW = 2.4;
    const archH = 3.6;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(archW + 0.4, 0.35, 0.3), materials.brassGold);
    frame.position.set(0, archH, 0);
    portalGroup.add(frame);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#241812';
    ctx.fillRect(0, 0, 512, 768);
    ctx.strokeStyle = '#d4af5f';
    ctx.lineWidth = 10;
    ctx.strokeRect(15, 15, 482, 738);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2be72';
    ctx.font = 'bold 44px "Playfair Display", "Georgia", "Times New Roman", serif';
    ctx.fillText('LỐI RA SẢNH CHÍNH', 256, 320);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "Be Vietnam Pro", "Segoe UI", sans-serif';
    ctx.fillText('🚪 CLICK ĐỂ RA SẢNH', 256, 440);

    const texture = new THREE.CanvasTexture(canvas);
    const doorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(archW, archH - 0.3),
      new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0x3d2a1c,
        emissiveIntensity: 0.3
      })
    );
    doorMesh.position.set(0, archH / 2, -0.05);
    doorMesh.rotation.y = Math.PI;
    doorMesh.userData = { type: 'exit_portal' };
    portalGroup.add(doorMesh);

    roomInteractables.push(doorMesh);
    parent.add(portalGroup);
  }

  // ==========================================================================
  // 3. DỰNG BỆ TRƯNG BÀY & BIỂN TÊN 3D BILLBOARD — SỬA LỖI 3
  // ==========================================================================
  function buildPlinthAndArtifact(parent, artifact) {
    const group = new THREE.Group();
    const { x, z } = artifact.toaDoKhongGian;
    group.position.set(x, 0, z);
    group.name = `Pedestal_${artifact.id}`;

    const plinthH = 1.05;
    const plinthR = 0.65;

    // 1. Bệ gỗ hình trụ vững chắc
    const plinthGeo = new THREE.CylinderGeometry(plinthR, plinthR * 1.08, plinthH, 24);
    const plinthMesh = new THREE.Mesh(plinthGeo, materials.plinthWood);
    plinthMesh.position.y = plinthH / 2;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    plinthMesh.userData = { type: 'artifact', id: artifact.id, artifactData: artifact };
    group.add(plinthMesh);
    roomInteractables.push(plinthMesh);

    // Vành đồng chỉ nẹp bệ trên & dưới
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(plinthR + 0.01, 0.02, 8, 32), materials.brassGold);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = plinthH;
    group.add(topRing);

    const bottomRing = new THREE.Mesh(new THREE.TorusGeometry(plinthR * 1.08 + 0.01, 0.025, 8, 32), materials.brassGold);
    bottomRing.rotation.x = Math.PI / 2;
    bottomRing.position.y = 0.03;
    group.add(bottomRing);

    // 2. Đèn rọi Spotlight riêng từ trần
    const spot = new THREE.SpotLight(0xfff1db, 1.6, 10, Math.PI / 6, 0.45, 1.2);
    spot.position.set(x, 5.0, z);
    spot.target = plinthMesh;
    spot.castShadow = false; // Tối ưu FPS: Bật đổ bóng nét cao chỉ khi focus vào bệ này
    spot.shadow.mapSize.width = 512;
    spot.shadow.mapSize.height = 512;
    spot.shadow.bias = -0.0005;
    parent.add(spot);
    pedestalSpotlights[artifact.id] = spot;
    pedestalGroups[artifact.id] = group;

    // 3. Dựng hiện vật 3D chi tiết cao
    const artifactMeshGroup = createUniqueArtifactGeometry(artifact);
    artifactMeshGroup.position.set(0, plinthH + 0.02, 0);
    artifactMeshGroup.userData = { type: 'artifact', id: artifact.id, artifactData: artifact };
    group.add(artifactMeshGroup);

    artifactMeshGroup.traverse(child => {
      if (child.isMesh) {
        child.userData = { type: 'artifact', id: artifact.id, artifactData: artifact };
        roomInteractables.push(child);
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // 4. Tủ kính bảo tàng trong suốt
    const glassGeo = new THREE.CylinderGeometry(plinthR - 0.02, plinthR - 0.02, 1.35, 32, 1, true);
    const glassMesh = new THREE.Mesh(glassGeo, materials.glassCase);
    glassMesh.position.y = plinthH + 0.675;
    group.add(glassMesh);

    // 5. Biển tên 3D Canvas Billboard tại chân bệ
    const nameplateCanvas = document.createElement('canvas');
    nameplateCanvas.width = 512;
    nameplateCanvas.height = 160;
    const npCtx = nameplateCanvas.getContext('2d');

    npCtx.fillStyle = 'rgba(28, 21, 17, 0.94)';
    roundRect(npCtx, 10, 10, 492, 140, 16);
    npCtx.fill();
    npCtx.strokeStyle = '#d4af5f';
    npCtx.lineWidth = 6;
    npCtx.stroke();

    const catObj = NHOM.find(n => n.ma === artifact.nhom);
    npCtx.fillStyle = '#e69d45';
    npCtx.font = 'bold 22px "Be Vietnam Pro", "Segoe UI", sans-serif';
    npCtx.fillText((catObj ? catObj.ten.toUpperCase() : 'DI SẢN'), 30, 48);

    npCtx.fillStyle = '#ffffff';
    npCtx.font = 'bold 32px "Playfair Display", "Georgia", "Times New Roman", serif';
    npCtx.fillText(artifact.ten, 30, 95);

    npCtx.fillStyle = '#d4af5f';
    npCtx.font = '500 18px "Be Vietnam Pro", "Segoe UI", sans-serif';
    npCtx.fillText('🔍 Nhấn để xem cận cảnh', 30, 128);

    const npTexture = new THREE.CanvasTexture(nameplateCanvas);
    npTexture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: npTexture,
      transparent: true,
      opacity: 0.9,
      depthTest: true
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 0.55, 0.72);
    sprite.scale.set(1.1, 0.35, 1.0);
    sprite.userData = {
      type: 'nameplate',
      parentPlinthPos: new THREE.Vector3(x, 0.55, z),
      spriteMaterial: spriteMat
    };
    group.add(sprite);
    nameplateSprites.push(sprite);

    parent.add(group);
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // Dựng một "đầu đao" (góc mái cong vút lên của kiến trúc đình chùa) tại một
  // góc mái cụ thể. SỬA LỖI: bản trước dùng MỘT hình trụ thẳng (đối xứng quanh
  // trục của chính nó) rồi gán rotation.x/rotation.y thủ công — vì hình trụ
  // đối xứng quanh trục, rotation.y không làm silhouette thay đổi gì cả, nên
  // cả 4 góc trông giống hệt nhau dù ang khác nhau, và hình cũng chỉ là một
  // que thẳng chứ không cong.
  // Cách sửa: ghép 3 đoạn hình trụ thon nối tiếp nhau, đoạn sau dốc hơn đoạn
  // trước (mô phỏng đường cong vút lên), và định hướng MỖI đoạn bằng quaternion
  // tính từ vector hướng thật trong không gian 3D — luôn đúng cho mọi góc ang,
  // không phụ thuộc việc gán Euler rotation thủ công.
  //   g            — group cha để add mesh vào
  //   material     — vật liệu gỗ dùng cho đầu đao
  //   ang          — góc phương vị của góc mái (radian), đã tính sẵn độ lệch 45°
  //   edgeRadius   — khoảng cách từ tâm tháp tới mép mái tại tầng này
  //   baseY        — độ cao Y của mép mái tại tầng này
  //   scale        — hệ số tỉ lệ kích thước đầu đao (tầng trên nhỏ hơn tầng dưới)
  function taoDauDao(g, material, ang, edgeRadius, baseY, scale) {
    const outDir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const up = new THREE.Vector3(0, 1, 0);

    // 3 đoạn thanh thoát: gốc ôm thoải theo góc ngói -> giữa vút chéo lên -> đầu vuốt nhọn cong đứng
    const segments = [
      { len: 0.075 * scale, rBase: 0.014 * scale, rTip: 0.009 * scale, riseAngle: 0.25 },
      { len: 0.065 * scale, rBase: 0.009 * scale, rTip: 0.005 * scale, riseAngle: 0.80 },
      { len: 0.055 * scale, rBase: 0.005 * scale, rTip: 0.002 * scale, riseAngle: 1.45 },
    ];

    const cursor = outDir.clone().multiplyScalar(edgeRadius);
    cursor.y = baseY;

    segments.forEach(seg => {
      const segDir = new THREE.Vector3(
        outDir.x * Math.cos(seg.riseAngle),
        Math.sin(seg.riseAngle),
        outDir.z * Math.cos(seg.riseAngle)
      ).normalize();

      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(seg.rTip, seg.rBase, seg.len, 8),
        material
      );
      // Định hướng đoạn theo đúng segDir bằng quaternion — chuẩn xác cho mọi góc phương vị
      mesh.quaternion.setFromUnitVectors(up, segDir);
      mesh.position.copy(cursor).addScaledVector(segDir, seg.len / 2);
      g.add(mesh);

      cursor.addScaledVector(segDir, seg.len);
    });
  }

  // ==========================================================================
  // 4. TẠO HÌNH HỌC CHI TIẾT CAO & ĐẶC TRƯNG CHO 8 HIỆN VẬT (BẢN PHỤC DỰNG CHUẨN XÁC)
  // ==========================================================================
  function createUniqueArtifactGeometry(artifact) {
    const g = new THREE.Group();
    const type = artifact.hinhDang;

    switch (type) {
      // -------------------------------------------------------------
      // 1. GÁC CHUÔNG CHÙA KEO (thap-tang-mai)
      // Tháp gỗ 3 tầng mái thu nhỏ, 12 đầu đao cong vút mềm mại
      // Hệ con sơn Đấu Củng chịu lực, 8 cột (4 cái, 4 quân) chân tảng hoa sen,
      // 84 cửa dàn quạt, đại hồng chung 1686 + chày gõ chuông gỗ lim treo lơ lửng, đỉnh tòa sen hồ lô
      // -------------------------------------------------------------
      case 'thap-tang-mai': {
        const limWood = new THREE.MeshStandardMaterial({ color: 0x3d2013, roughness: 0.65 });
        const roofTile = new THREE.MeshStandardMaterial({ color: 0x22130c, roughness: 0.7 });
        const blueStone = new THREE.MeshStandardMaterial({ color: 0x566068, roughness: 0.85 });
        const bronzeGilded = new THREE.MeshStandardMaterial({ color: 0xd4af5f, metalness: 0.88, roughness: 0.25 });
        const fanLatticeMat = new THREE.MeshStandardMaterial({ color: 0x5c331e, roughness: 0.6 });
        const silkCordRed = new THREE.MeshBasicMaterial({ color: 0xaa1e1e });

        // 1. Bệ tam cấp bằng đá xanh 3 bậc dưới chân tháp
        const step1 = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.03, 0.86), blueStone);
        step1.position.y = 0.015;
        g.add(step1);

        const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.03, 0.78), blueStone);
        step2.position.y = 0.045;
        g.add(step2);

        const step3 = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.03, 0.70), blueStone);
        step3.position.y = 0.075;
        g.add(step3);

        // 2. 8 Cột chia 2 lớp: 4 cột cái (trong) và 4 cột quân (ngoài)
        const stoneDiscGeo = new THREE.CylinderGeometry(0.038, 0.042, 0.02, 12);

        // 4 Cột cái (trong)
        const colCaiGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.94, 10);
        const caiOffsets = [-0.14, 0.14];
        caiOffsets.forEach(cx => {
          caiOffsets.forEach(cz => {
            const stoneDisc = new THREE.Mesh(stoneDiscGeo, blueStone);
            stoneDisc.position.set(cx, 0.095, cz);
            g.add(stoneDisc);

            const pillar = new THREE.Mesh(colCaiGeo, limWood);
            pillar.position.set(cx, 0.09 + 0.47, cz);
            g.add(pillar);
          });
        });

        // 4 Cột quân (ngoài)
        const colQuanGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10);
        const quanOffsets = [-0.24, 0.24];
        quanOffsets.forEach(qx => {
          quanOffsets.forEach(qz => {
            const stoneDisc = new THREE.Mesh(stoneDiscGeo, blueStone);
            stoneDisc.position.set(qx, 0.095, qz);
            g.add(stoneDisc);

            const pillar = new THREE.Mesh(colQuanGeo, limWood);
            pillar.position.set(qx, 0.09 + 0.21, qz);
            g.add(pillar);
          });
        });

        // Dầm ngang mộng gỗ giằng cột
        const beamX = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.022, 0.022), limWood);
        beamX.position.set(0, 0.30, 0.14);
        g.add(beamX);
        const beamX2 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.022, 0.022), limWood);
        beamX2.position.set(0, 0.30, -0.14);
        g.add(beamX2);
        const beamZ = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.52), limWood);
        beamZ.position.set(0.14, 0.30, 0);
        g.add(beamZ);
        const beamZ2 = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.52), limWood);
        beamZ2.position.set(-0.14, 0.30, 0);
        g.add(beamZ2);

        // HỆ THỐNG CON SƠN ĐẤU CỦNG (Dou-Gong) CHỊU LỰC DƯỚI TẦNG MÁI 1
        const douGongGeo = new THREE.BoxGeometry(0.08, 0.015, 0.02);
        [-0.14, 0.14].forEach(bx => {
          [-0.24, 0.24].forEach(bz => {
            const dg = new THREE.Mesh(douGongGeo, limWood);
            dg.position.set(bx, 0.35, bz);
            g.add(dg);
          });
        });

        // 3. TẦNG MÁI 1: Bốn góc có ĐẦU ĐAO CONG VÚT
        const roof1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 0.11, 4, 1), roofTile);
        roof1.rotation.y = Math.PI / 4;
        roof1.position.y = 0.38;
        g.add(roof1);

        const corners = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        corners.forEach(ang => {
          taoDauDao(g, limWood, ang + Math.PI / 4, 0.58, 0.33, 1.0);
        });

        // 4. TẦNG 2: Lan can con tiện chạy vòng quanh & Cửa dàn quạt
        const balustradeRail = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.015, 0.40), limWood);
        balustradeRail.position.y = 0.48;
        g.add(balustradeRail);

        const balusterGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6);
        for (let bx = -0.18; bx <= 0.18; bx += 0.06) {
          const bFront = new THREE.Mesh(balusterGeo, limWood);
          bFront.position.set(bx, 0.45, 0.19);
          g.add(bFront);
          const bBack = new THREE.Mesh(balusterGeo, limWood);
          bBack.position.set(bx, 0.45, -0.19);
          g.add(bBack);
        }

        // Cửa dàn quạt 4 mặt
        const fanDoor1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.015), fanLatticeMat);
        fanDoor1.position.set(0, 0.55, 0.14);
        g.add(fanDoor1);
        const fanDoor2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.015), fanLatticeMat);
        fanDoor2.position.set(0, 0.55, -0.14);
        g.add(fanDoor2);

        // QUẢ ĐẠI HỒNG CHUNG 1686 & CHÀY GÕ CHUÔNG GỖ LIM
        const bellGroup = new THREE.Group();
        bellGroup.position.set(0, 0.54, 0);

        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.115, 0.18, 16), bronzeGilded);
        bellGroup.add(bell);

        // 4 Núm gõ hoa sen trên thân chuông
        for (let ni = 0; ni < 4; ni++) {
          const nang = (ni * Math.PI) / 2;
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), materials.brassGold);
          knob.position.set(Math.cos(nang) * 0.09, -0.02, Math.sin(nang) * 0.09);
          bellGroup.add(knob);
        }

        const dragonQuai = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 16), bronzeGilded);
        dragonQuai.position.y = 0.11;
        bellGroup.add(dragonQuai);

        // Chày gõ chuông bằng gỗ lim treo lơ lửng bên cạnh
        const striker = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.18, 8), limWood);
        striker.rotation.z = Math.PI / 2;
        striker.position.set(0.13, -0.02, 0);
        bellGroup.add(striker);

        const cord1 = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 4), silkCordRed);
        cord1.position.set(0.08, 0.05, 0);
        bellGroup.add(cord1);
        const cord2 = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 4), silkCordRed);
        cord2.position.set(0.17, 0.05, 0);
        bellGroup.add(cord2);

        g.add(bellGroup);

        // TẦNG MÁI 2
        const roof2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.46, 0.10, 4, 1), roofTile);
        roof2.rotation.y = Math.PI / 4;
        roof2.position.y = 0.70;
        g.add(roof2);

        corners.forEach(ang => {
          taoDauDao(g, limWood, ang + Math.PI / 4, 0.43, 0.655, 0.78);
        });

        // TẦNG MÁI 3: Mái đỉnh
        const roof3 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 0.08, 4, 1), roofTile);
        roof3.rotation.y = Math.PI / 4;
        roof3.position.y = 0.88;
        g.add(roof3);

        corners.forEach(ang => {
          taoDauDao(g, limWood, ang + Math.PI / 4, 0.30, 0.845, 0.60);
        });

        // ĐỈNH THÁP: Tòa sen đỡ + Bầu hồ lô đồng thắt eo
        const lotusPodium = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.04, 16), bronzeGilded);
        lotusPodium.position.y = 0.94;
        g.add(lotusPodium);

        const gourdBottom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), bronzeGilded);
        gourdBottom.position.y = 0.98;
        g.add(gourdBottom);

        const gourdTop = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), bronzeGilded);
        gourdTop.position.y = 1.04;
        g.add(gourdTop);

        const gourdTip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 8), bronzeGilded);
        gourdTip.position.y = 1.08;
        g.add(gourdTip);
        break;
      }

      // -------------------------------------------------------------
      // 2. KHU LĂNG MỘ TAM ĐƯỜNG (mo-dat-bia-da)
      // Nền đá 2 tầng có bậc tam cấp → Rùa đá cõng bia khắc chữ Nho dát vàng → Gò mộ tròn thấp
      // 4 trụ đá búp sen chạm cánh sen lật, Trán bia chạm Lưỡng Long Chầu Nguyệt, Lư hương Tam Cúc mặt Hổ Phù
      // -------------------------------------------------------------
      case 'mo-dat-bia-da': {
        const stoneAsh = new THREE.MeshStandardMaterial({ color: 0x686e73, roughness: 0.85 });
        const steleStone = new THREE.MeshStandardMaterial({ color: 0x4e5458, roughness: 0.75 });
        const tumulusGrass = new THREE.MeshStandardMaterial({ color: 0x485838, roughness: 0.95 });
        const incenseBronze = new THREE.MeshStandardMaterial({ color: 0x7a7266, metalness: 0.5, roughness: 0.5 });
        const emberGlow = new THREE.MeshBasicMaterial({ color: 0xff3b00 });

        // 1. Nền đá 2 tầng có bậc tam cấp
        const terr1 = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.035, 0.75), stoneAsh);
        terr1.position.set(0, 0.0175, 0);
        g.add(terr1);

        const stepTerr1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.08), stoneAsh);
        stepTerr1.position.set(0, 0.01, 0.40);
        g.add(stepTerr1);

        const terr2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.035, 0.64), stoneAsh);
        terr2.position.set(0, 0.0525, -0.02);
        g.add(terr2);

        const stepTerr2 = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.02, 0.07), stoneAsh);
        stepTerr2.position.set(0, 0.045, 0.32);
        g.add(stepTerr2);

        // 2. 4 Trụ đá ở 4 góc có BÚP SEN & CÁNH SEN LẬT
        const postOffsets = [
          { x: -0.38, z: -0.30 }, { x: 0.38, z: -0.30 },
          { x: -0.38, z: 0.26 },  { x: 0.38, z: 0.26 }
        ];
        postOffsets.forEach(pos => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.045), stoneAsh);
          post.position.set(pos.x, 0.14, pos.z);
          g.add(post);

          const lotusPetals = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.02, 8), stoneAsh);
          lotusPetals.position.set(pos.x, 0.215, pos.z);
          g.add(lotusPetals);

          const lotusBud = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 8), stoneAsh);
          lotusBud.position.set(pos.x, 0.25, pos.z);
          g.add(lotusBud);
        });

        // 3. GÒ MỘ TRÒN THẤP PHÍA SAU
        const tumulus = new THREE.Mesh(
          new THREE.SphereGeometry(0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          tumulusGrass
        );
        tumulus.scale.set(1.2, 0.55, 1.0);
        tumulus.position.set(0, 0.07, -0.12);
        g.add(tumulus);

        // 4. CỤM RÙA ĐÁ ĐỘI BIA KHẮC CHỮ NHO DÁT VÀNG
        const tortoiseGroup = new THREE.Group();
        tortoiseGroup.position.set(0, 0.07, 0.10);

        // Mai rùa khía ô lục giác
        const turtleShell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), steleStone);
        turtleShell.scale.set(1.15, 0.5, 1.35);
        turtleShell.position.y = 0.04;
        tortoiseGroup.add(turtleShell);

        // Đầu rùa vươn dài mắt tròn
        const turtleHead = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 8), steleStone);
        turtleHead.rotation.x = Math.PI / 2.8;
        turtleHead.position.set(0, 0.05, 0.15);
        tortoiseGroup.add(turtleHead);

        // 4 Chân rùa có móng vuốt bám đá
        const footGeo = new THREE.BoxGeometry(0.035, 0.025, 0.04);
        [[-0.10, 0.08], [0.10, 0.08], [-0.10, -0.08], [0.10, -0.08]].forEach(fp => {
          const foot = new THREE.Mesh(footGeo, steleStone);
          foot.position.set(fp[0], 0.015, fp[1]);
          tortoiseGroup.add(foot);
        });

        // Thân bia đá
        const steleBody = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.36, 0.045), steleStone);
        steleBody.position.set(0, 0.24, 0);
        tortoiseGroup.add(steleBody);

        // Canvas Texture khắc chữ Nho cổ dát vàng trên mặt bia
        const steleCanvas = document.createElement('canvas');
        steleCanvas.width = 256;
        steleCanvas.height = 512;
        const sctx = steleCanvas.getContext('2d');
        sctx.fillStyle = '#4e5458';
        sctx.fillRect(0, 0, 256, 512);
        sctx.strokeStyle = '#d4af5f';
        sctx.lineWidth = 6;
        sctx.strokeRect(10, 10, 236, 492);

        sctx.textAlign = 'center';
        sctx.fillStyle = '#e2be72';
        sctx.font = 'bold 32px serif';
        sctx.fillText('東', 128, 90);
        sctx.fillText('阿', 128, 150);
        sctx.fillText('萬', 128, 210);
        sctx.fillText('古', 128, 270);
        sctx.font = 'bold 22px serif';
        sctx.fillText('陳 朝 聖 祖 陵', 128, 360);

        const steleTex = new THREE.CanvasTexture(steleCanvas);
        const inscriptionPlate = new THREE.Mesh(
          new THREE.PlaneGeometry(0.18, 0.32),
          new THREE.MeshStandardMaterial({ map: steleTex, roughness: 0.6 })
        );
        inscriptionPlate.position.set(0, 0.24, 0.023);
        tortoiseGroup.add(inscriptionPlate);

        // Trán bia Lưỡng Long Chầu Nguyệt
        const steleCrest = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.045, 24), steleStone);
        steleCrest.rotation.x = Math.PI / 2;
        steleCrest.position.set(0, 0.42, 0);
        tortoiseGroup.add(steleCrest);

        const moonEmblem = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), materials.brassGold);
        moonEmblem.position.set(0, 0.42, 0.024);
        tortoiseGroup.add(moonEmblem);

        g.add(tortoiseGroup);

        // 5. LƯ HƯƠNG ĐÁ 3 CHÂN TAM CÚC MẶT HỔ PHÙ
        const burnerGroup = new THREE.Group();
        burnerGroup.position.set(0, 0.07, 0.28);

        const burnerBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.04, 0.07, 16), incenseBronze);
        burnerBowl.position.y = 0.055;
        burnerGroup.add(burnerBowl);

        // Mặt Hổ Phù nổi ở chính diện lư hương
        const tigerFace = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), materials.brassGold);
        tigerFace.position.set(0, 0.06, 0.058);
        burnerGroup.add(tigerFace);

        // 3 Chân tam cúc
        const legGeo = new THREE.CylinderGeometry(0.012, 0.01, 0.04, 6);
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Mesh(legGeo, incenseBronze);
          const lang = (i * Math.PI * 2) / 3;
          leg.position.set(Math.cos(lang) * 0.035, 0.02, Math.sin(lang) * 0.035);
          leg.rotation.z = Math.cos(lang) * 0.2;
          burnerGroup.add(leg);
        }

        const ashBed = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshBasicMaterial({ color: 0x444444 }));
        ashBed.rotation.x = -Math.PI / 2;
        ashBed.position.y = 0.091;
        burnerGroup.add(ashBed);

        // 3 Que nhang cắm nghiêng đang cháy
        const stickGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.11, 4);
        const stickMat = new THREE.MeshBasicMaterial({ color: 0xaa2200 });

        const s1 = new THREE.Mesh(stickGeo, stickMat);
        s1.position.set(0, 0.15, 0);
        burnerGroup.add(s1);

        const tip1 = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), emberGlow);
        tip1.position.set(0, 0.205, 0);
        burnerGroup.add(tip1);

        const s2 = new THREE.Mesh(stickGeo, stickMat);
        s2.rotation.z = 0.15;
        s2.position.set(0.02, 0.145, 0.01);
        burnerGroup.add(s2);

        const tip2 = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), emberGlow);
        tip2.position.set(0.035, 0.198, 0.01);
        burnerGroup.add(tip2);

        g.add(burnerGroup);
        break;
      }

      // -------------------------------------------------------------
      // 3. CHIẾU CHÈO LÀNG KHUỐC (mat-na-cheo)
      // Giá gỗ mun 2 mặt nạ Hề Chèo & Đào Nữ + Quạt lụa nan tre + Gậy hề ngũ sắc +
      // TRỐNG ĐẾ CHÈO (TRỐNG CƠM) & ĐÀN NHỊ CỔ TRUYỀN
      // -------------------------------------------------------------
      case 'mat-na-cheo': {
        const ebonyWood = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.4, metalness: 0.2 });
        const clownSkin = new THREE.MeshStandardMaterial({ color: 0xf5dfc6, roughness: 0.4 });
        const daoSkin = new THREE.MeshStandardMaterial({ color: 0xfcf6ed, roughness: 0.25 });
        const redCheek = new THREE.MeshStandardMaterial({ color: 0xbf2626, roughness: 0.3 });
        const silkFanMat = new THREE.MeshStandardMaterial({ color: 0xfaebd7, roughness: 0.6, side: THREE.DoubleSide });
        const bambooRib = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
        const drumSkin = new THREE.MeshStandardMaterial({ color: 0xe6d4b8, roughness: 0.8 });

        // 1. Giá gỗ mun đứng
        const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.26), ebonyWood);
        standBase.position.y = 0.0175;
        g.add(standBase);

        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8), ebonyWood);
        postL.position.set(-0.14, 0.26, 0);
        g.add(postL);

        const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8), ebonyWood);
        postR.position.set(0.14, 0.26, 0);
        g.add(postR);

        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.018, 0.018), ebonyWood);
        crossBar.position.set(0, 0.46, 0);
        g.add(crossBar);

        // 2. MẶT NẠ HỀ CHÈO (Bên trái): Búi tóc củ hành, răng cười hóm hỉnh
        const clownGroup = new THREE.Group();
        clownGroup.position.set(-0.14, 0.44, 0.06);

        const maskClown = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), clownSkin);
        maskClown.scale.set(1.05, 1.25, 0.45);
        clownGroup.add(maskClown);

        const topKnot = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), ebonyWood);
        topKnot.scale.set(1.0, 1.3, 0.9);
        topKnot.position.set(0, 0.16, 0);
        clownGroup.add(topKnot);

        const eyeClownGeo = new THREE.TorusGeometry(0.024, 0.005, 6, 12, Math.PI);
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const eyeCL = new THREE.Mesh(eyeClownGeo, blackMat);
        eyeCL.position.set(-0.045, 0.035, 0.065);
        clownGroup.add(eyeCL);

        const eyeCR = new THREE.Mesh(eyeClownGeo, blackMat);
        eyeCR.position.set(0.045, 0.035, 0.065);
        clownGroup.add(eyeCR);

        const wideMouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.010, 8, 16, Math.PI), redCheek);
        wideMouth.rotation.x = Math.PI;
        wideMouth.position.set(0, -0.035, 0.065);
        clownGroup.add(wideMouth);

        const chL = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), redCheek);
        chL.position.set(-0.075, 0, 0.068);
        clownGroup.add(chL);

        const chR = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), redCheek);
        chR.position.set(0.075, 0, 0.068);
        clownGroup.add(chR);

        g.add(clownGroup);

        // 3. MẶT NẠ ĐÀO NỮ (Bên phải): Mặt thon oval, mắt phượng, chấm ruồi duyên
        const daoGroup = new THREE.Group();
        daoGroup.position.set(0.14, 0.44, 0.06);

        const maskDao = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), daoSkin);
        maskDao.scale.set(0.92, 1.35, 0.40);
        daoGroup.add(maskDao);

        const eyeDaoGeo = new THREE.BoxGeometry(0.035, 0.005, 0.005);
        const eyeDL = new THREE.Mesh(eyeDaoGeo, blackMat);
        eyeDL.rotation.z = 0.25;
        eyeDL.position.set(-0.04, 0.04, 0.055);
        daoGroup.add(eyeDL);

        const eyeDR = new THREE.Mesh(eyeDaoGeo, blackMat);
        eyeDR.rotation.z = -0.25;
        eyeDR.position.set(0.04, 0.04, 0.055);
        daoGroup.add(eyeDR);

        const browGeo = new THREE.TorusGeometry(0.028, 0.003, 6, 12, Math.PI * 0.7);
        const browL = new THREE.Mesh(browGeo, blackMat);
        browL.position.set(-0.04, 0.065, 0.055);
        daoGroup.add(browL);

        const browR = new THREE.Mesh(browGeo, blackMat);
        browR.position.set(0.04, 0.065, 0.055);
        daoGroup.add(browR);

        const lipDao = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), redCheek);
        lipDao.scale.set(1.3, 0.7, 0.7);
        lipDao.position.set(0, -0.045, 0.055);
        daoGroup.add(lipDao);

        // Nốt ruồi duyên
        const mole = new THREE.Mesh(new THREE.CircleGeometry(0.003, 8), blackMat);
        mole.position.set(0.03, -0.03, 0.058);
        daoGroup.add(mole);

        g.add(daoGroup);

        // 4. QUẠT GIẤY LỤA XOÈ RỘNG HẾT CỠ
        const fanGroup = new THREE.Group();
        fanGroup.position.set(0, 0.32, -0.06);
        fanGroup.rotation.z = -0.25;

        const fanSilk = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24, 0, Math.PI * 0.88), silkFanMat);
        fanGroup.add(fanSilk);

        const ribGeo = new THREE.BoxGeometry(0.004, 0.26, 0.003);
        for (let a = 0; a <= Math.PI * 0.88; a += Math.PI * 0.11) {
          const rib = new THREE.Mesh(ribGeo, bambooRib);
          rib.rotation.z = a - Math.PI / 2;
          rib.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.002);
          fanGroup.add(rib);
        }
        g.add(fanGroup);

        // 5. GẬY HỀ CHÈO NGŨ SẮC
        const batonGroup = new THREE.Group();
        batonGroup.position.set(0, 0.05, 0.12);
        batonGroup.rotation.z = 1.15;

        const colors5 = [0xba2424, 0xdeb841, 0x1f7a8c, 0xfbfbfb, 0x111111];
        for (let i = 0; i < 5; i++) {
          const seg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8),
            new THREE.MeshStandardMaterial({ color: colors5[i], roughness: 0.5 })
          );
          seg.position.y = (i - 2) * 0.07;
          batonGroup.add(seg);
        }
        g.add(batonGroup);

        // 6. TRỐNG ĐẾ CHÈO CẦM TAY & ĐÀN NHỊ CỔ TRUYỀN DƯỚI BỆ
        const cheoDrumGroup = new THREE.Group();
        cheoDrumGroup.position.set(-0.16, 0.05, 0.08);

        const cheoDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0x9b1b1b, roughness: 0.4 }));
        cheoDrumGroup.add(cheoDrum);

        const cheoDrumSkin = new THREE.Mesh(new THREE.CircleGeometry(0.063, 16), drumSkin);
        cheoDrumSkin.rotation.x = -Math.PI / 2;
        cheoDrumSkin.position.y = 0.036;
        cheoDrumGroup.add(cheoDrumSkin);
        g.add(cheoDrumGroup);

        // Đàn Nhị chèo gác chéo
        const erhuGroup = new THREE.Group();
        erhuGroup.position.set(0.18, 0.08, 0.06);
        erhuGroup.rotation.z = -0.35;
        erhuGroup.rotation.y = 0.2;

        const erhuBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), ebonyWood);
        erhuBody.rotation.x = Math.PI / 2;
        erhuGroup.add(erhuBody);

        const erhuNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.32, 8), ebonyWood);
        erhuNeck.position.y = 0.16;
        erhuGroup.add(erhuNeck);

        const erhuBow = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 6), bambooRib);
        erhuBow.rotation.z = 1.2;
        erhuBow.position.set(-0.02, 0.08, 0.02);
        erhuGroup.add(erhuBow);

        g.add(erhuGroup);
        break;
      }

      // -------------------------------------------------------------
      // 4. TRỐNG HỘI & RƯỚC KIỆU (trong-hoi)
      // Thân trống mít sơn son đỏ thắm vẽ mây lửa + Mặt da trâu Thái Cực + 2 hàng đinh tán đồng
      // 4 QUAI ĐỒNG ĐẦU NGHÊ + CỜ HỘI NGŨ SẮC TRUYỀN THỐNG + Đôi dùi trống lụa vàng
      // -------------------------------------------------------------
      case 'trong-hoi': {
        const drumRedLacquer = new THREE.MeshStandardMaterial({ color: 0xb51a1a, roughness: 0.25, metalness: 0.2 });
        const buffaloSkin = new THREE.MeshStandardMaterial({ color: 0xdecba5, roughness: 0.8 });
        const goldRelief = new THREE.MeshStandardMaterial({ color: 0xd4af5f, metalness: 0.85, roughness: 0.25 });
        const darkWoodDragon = new THREE.MeshStandardMaterial({ color: 0x2e1910, roughness: 0.6 });

        // 1. Giá đỡ chữ X đầu rồng
        const xLegGeo = new THREE.BoxGeometry(0.045, 0.60, 0.045);
        const legX1 = new THREE.Mesh(xLegGeo, darkWoodDragon);
        legX1.rotation.z = 0.44;
        legX1.position.set(-0.11, 0.25, 0);
        g.add(legX1);

        const legX2 = new THREE.Mesh(xLegGeo, darkWoodDragon);
        legX2.rotation.z = -0.44;
        legX2.position.set(0.11, 0.25, 0);
        g.add(legX2);

        const dHeadL = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), goldRelief);
        dHeadL.rotation.z = -1.2;
        dHeadL.position.set(-0.24, 0.48, 0);
        g.add(dHeadL);

        const dHeadR = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), goldRelief);
        dHeadR.rotation.z = 1.2;
        dHeadR.position.set(0.24, 0.48, 0);
        g.add(dHeadR);

        const crossBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 8), darkWoodDragon);
        crossBrace.rotation.x = Math.PI / 2;
        crossBrace.position.set(0, 0.12, 0);
        g.add(crossBrace);

        // 2. Thùng trống phình giữa
        const drumGroup = new THREE.Group();
        drumGroup.position.set(0, 0.48, 0);

        const barrelMid = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.16, 32), drumRedLacquer);
        barrelMid.rotation.x = Math.PI / 2;
        drumGroup.add(barrelMid);

        const barrelFront = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.29, 0.14, 32), drumRedLacquer);
        barrelFront.rotation.x = Math.PI / 2;
        barrelFront.position.z = 0.15;
        drumGroup.add(barrelFront);

        const barrelBack = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.265, 0.14, 32), drumRedLacquer);
        barrelBack.rotation.x = Math.PI / 2;
        barrelBack.position.z = -0.15;
        drumGroup.add(barrelBack);

        // Đai giữa mây lửa dát vàng
        const goldBand = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.09, 32), goldRelief);
        goldBand.rotation.x = Math.PI / 2;
        drumGroup.add(goldBand);

        // 4 Quai đồng đầu Nghê hai bên hông
        [-0.29, 0.29].forEach(qx => {
          [-0.05, 0.05].forEach(qz => {
            const ngueHandle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 16), goldRelief);
            ngueHandle.position.set(qx, 0, qz);
            ngueHandle.rotation.y = Math.PI / 2;
            drumGroup.add(ngueHandle);
          });
        });

        // Mặt da trâu vẽ Thái Cực
        const skinFront = new THREE.Mesh(new THREE.CircleGeometry(0.264, 32), buffaloSkin);
        skinFront.position.z = 0.221;
        drumGroup.add(skinFront);

        const yinYangCircle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), drumRedLacquer);
        yinYangCircle.position.z = 0.223;
        drumGroup.add(yinYangCircle);

        const skinBack = new THREE.Mesh(new THREE.CircleGeometry(0.264, 32), buffaloSkin);
        skinBack.rotation.y = Math.PI;
        skinBack.position.z = -0.221;
        drumGroup.add(skinBack);

        // 2 Hàng đinh tán đồng
        const rivetGeo = new THREE.SphereGeometry(0.008, 8, 8);
        const rivetCount = 20;
        for (let i = 0; i < rivetCount; i++) {
          const rang = (i * Math.PI * 2) / rivetCount;
          const rx = Math.cos(rang) * 0.26;
          const ry = Math.sin(rang) * 0.26;

          const rivF = new THREE.Mesh(rivetGeo, goldRelief);
          rivF.position.set(rx, ry, 0.185);
          drumGroup.add(rivF);

          const rivB = new THREE.Mesh(rivetGeo, goldRelief);
          rivB.position.set(rx, ry, -0.185);
          drumGroup.add(rivB);
        }

        g.add(drumGroup);

        // CỜ HỘI NGŨ SẮC TRUYỀN THỐNG CẮM CHÉO PHÍA SAU
        const flagGroup = new THREE.Group();
        flagGroup.position.set(-0.28, 0.35, -0.14);
        flagGroup.rotation.z = 0.35;

        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.72, 8), darkWoodDragon);
        flagGroup.add(flagPole);

        const flagCloth = new THREE.Mesh(
          new THREE.PlaneGeometry(0.28, 0.28),
          new THREE.MeshStandardMaterial({ color: 0xba2424, roughness: 0.5, side: THREE.DoubleSide })
        );
        flagCloth.position.set(0.14, 0.22, 0);
        flagGroup.add(flagCloth);

        const flagBorder = new THREE.Mesh(
          new THREE.PlaneGeometry(0.32, 0.32),
          new THREE.MeshStandardMaterial({ color: 0xdeb841, roughness: 0.4, side: THREE.DoubleSide })
        );
        flagBorder.position.set(0.14, 0.22, -0.001);
        flagGroup.add(flagBorder);

        g.add(flagGroup);

        // Đôi dùi trống có tua lụa vàng
        const stickGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.40, 8);
        const stick1 = new THREE.Mesh(stickGeo, drumRedLacquer);
        stick1.rotation.z = -0.62;
        stick1.rotation.x = 0.25;
        stick1.position.set(0.30, 0.28, 0.16);
        g.add(stick1);

        const tassel1 = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.09, 8), goldRelief);
        tassel1.rotation.z = 0.85;
        tassel1.position.set(0.42, 0.14, 0.18);
        g.add(tassel1);
        break;
      }

      // -------------------------------------------------------------
      // 5. CHẠM BẠC ĐỒNG XÂM (mam-bac)
      // MÂM BỒNG CÓ CHÂN ĐẾ 3 CHÂN TAM SƯ + Lòng mâm chạm lộng Long Phụng Sum Vầy
      // BỘ DỤNG CỤ KIM HOÀN CỦA NGHỆ NHÂN (Búa gõ bạc, đục chạm, đe gỗ) +
      // CƠI TRẦU BẠC HÌNH QUẢ BÍ NGÔ HÉ MỞ LỘ MIẾNG TRẦU CÁNH PHƯỢNG + Vòng tay rồng
      // -------------------------------------------------------------
      case 'mam-bac': {
        const mirrorSilver = new THREE.MeshStandardMaterial({
          color: 0xf8f8f8,
          metalness: 0.98,
          roughness: 0.12
        });
        const limeGreen = new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.5 });
        const roseRed = new THREE.MeshStandardMaterial({ color: 0xc42036, roughness: 0.4 });
        const benchWood = new THREE.MeshStandardMaterial({ color: 0x3a2216, roughness: 0.6 });

        // 1. MÂM BỒNG CÓ CHÂN ĐẾ 3 CHÂN TAM SƯ
        const pedestalCompote = new THREE.Group();
        pedestalCompote.position.set(0, 0.25, 0.04);
        pedestalCompote.rotation.x = -0.25;

        // Chân đế mâm bồng
        const compoteFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.04, 32), mirrorSilver);
        compoteFoot.position.y = 0.02;
        pedestalCompote.add(compoteFoot);

        // 3 Tượng sư tử (Tam Sư) đỡ chân mâm
        for (let si = 0; si < 3; si++) {
          const sang = (si * Math.PI * 2) / 3;
          const lion = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), materials.brassGold);
          lion.position.set(Math.cos(sang) * 0.15, 0.02, Math.sin(sang) * 0.15);
          pedestalCompote.add(lion);
        }

        const compoteStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.12, 32), mirrorSilver);
        compoteStem.position.y = 0.09;
        pedestalCompote.add(compoteStem);

        const dishPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.16, 0.04, 48), mirrorSilver);
        dishPlate.position.y = 0.16;
        pedestalCompote.add(dishPlate);

        // Vành hoa cúc dây
        const rimChrysanthemum = new THREE.Mesh(new THREE.TorusGeometry(0.395, 0.018, 16, 48), mirrorSilver);
        rimChrysanthemum.rotation.x = Math.PI / 2;
        rimChrysanthemum.position.y = 0.18;
        pedestalCompote.add(rimChrysanthemum);

        // Vòng 24 cánh sen chạm lộng
        const rimLotus24 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 12, 36), mirrorSilver);
        rimLotus24.rotation.x = Math.PI / 2;
        rimLotus24.position.y = 0.17;
        pedestalCompote.add(rimLotus24);

        // Tâm mâm: Long Phụng Sum Vầy & Viên ngọc
        const flamingPearl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), materials.brassGold);
        flamingPearl.scale.set(1.0, 0.4, 1.0);
        flamingPearl.position.set(0, 0.17, 0);
        pedestalCompote.add(flamingPearl);

        const dragonReliefRing = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.010, 8, 24), mirrorSilver);
        dragonReliefRing.rotation.x = Math.PI / 2;
        dragonReliefRing.position.y = 0.17;
        pedestalCompote.add(dragonReliefRing);

        // Vòng tay bạc rồng
        const dragonBracelet = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 12, 32), mirrorSilver);
        dragonBracelet.rotation.x = Math.PI / 2;
        dragonBracelet.position.set(-0.12, 0.20, 0.08);
        pedestalCompote.add(dragonBracelet);

        // Cơi trầu quả bí ngô nắp hé mở
        const pumpkinGroup = new THREE.Group();
        pumpkinGroup.position.set(0.12, 0.22, -0.06);

        const pumpkinCore = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), mirrorSilver);
        pumpkinCore.scale.set(1.15, 0.75, 1.15);
        pumpkinGroup.add(pumpkinCore);

        const lotusKnob = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.035, 8), materials.brassGold);
        lotusKnob.position.set(0.02, 0.075, 0.01);
        lotusKnob.rotation.z = -0.25;
        pumpkinGroup.add(lotusKnob);

        // Miếng trầu têm cánh phượng bên trong
        const betelLeaf = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), limeGreen);
        betelLeaf.rotation.x = Math.PI / 2.2;
        betelLeaf.position.set(0, 0.05, 0);
        pumpkinGroup.add(betelLeaf);

        pedestalCompote.add(pumpkinGroup);
        g.add(pedestalCompote);

        // 2. BỘ DỤNG CỤ KIM HOÀN NGHỆ NHÂN ĐỒNG XÂM
        const toolGroup = new THREE.Group();
        toolGroup.position.set(-0.25, 0.04, 0.16);

        const woodenAnvil = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.10), benchWood);
        toolGroup.add(woodenAnvil);

        // Búa gõ bạc cán mun
        const hammerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6), benchWood);
        hammerHandle.rotation.z = 1.2;
        hammerHandle.position.set(0, 0.035, 0);
        toolGroup.add(hammerHandle);

        const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 0.018), mirrorSilver);
        hammerHead.position.set(0.07, 0.06, 0);
        toolGroup.add(hammerHead);

        // Đục trổ chạm bạc
        const chisel = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.12, 6), mirrorSilver);
        chisel.rotation.z = 0.8;
        chisel.position.set(-0.03, 0.035, 0.03);
        toolGroup.add(chisel);

        g.add(toolGroup);
        break;
      }

      // -------------------------------------------------------------
      // 6. DỆT CHIẾU HỚI (chieu-cuon)
      // KHUNG LƯỢC DẬP CHIẾU GỖ CĂNG CHỈ ĐAY + Tấm chiếu hoa chữ Thọ ngũ sắc +
      // Cuộn chiếu sọc màu + Bó cói tươi & đỏ có lạt buộc + Con thoi có cuộn sợi đay trắng
      // -------------------------------------------------------------
      case 'chieu-cuon': {
        const strawNatural = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.85 });
        const redSedge = new THREE.MeshStandardMaterial({ color: 0xb52222, roughness: 0.85 });
        const indigoSedge = new THREE.MeshStandardMaterial({ color: 0x1f6e8c, roughness: 0.85 });
        const goldSedge = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.85 });
        const polishedShuttle = new THREE.MeshStandardMaterial({ color: 0x3d2012, roughness: 0.35, metalness: 0.1 });
        const juteThread = new THREE.MeshBasicMaterial({ color: 0xf5f2eb });

        // 1. TẤM CHIẾU HOA CHỮ THỌ NGŨ SẮC
        const flatMat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.018, 0.54), strawNatural);
        flatMat.position.y = 0.009;
        g.add(flatMat);

        const diamondBorder1 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.06), redSedge);
        diamondBorder1.position.set(0, 0.01, 0.16);
        g.add(diamondBorder1);

        const diamondBorder2 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.06), redSedge);
        diamondBorder2.position.set(0, 0.01, -0.16);
        g.add(diamondBorder2);

        // Chữ Thọ ngũ sắc tâm chiếu
        const thoMedallion = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.022, 0.18), indigoSedge);
        thoMedallion.position.set(0, 0.011, 0);
        g.add(thoMedallion);

        const thoCenterGold = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.024, 0.08), goldSedge);
        thoCenterGold.position.set(0, 0.012, 0);
        g.add(thoCenterGold);

        // 4 Hoa sen góc chiếu
        [[-0.28, 0.18], [0.28, 0.18], [-0.28, -0.18], [0.28, -0.18]].forEach(lp => {
          const lotusCorner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.06), goldSedge);
          lotusCorner.position.set(lp[0], 0.011, lp[1]);
          g.add(lotusCorner);
        });

        // 2. KHUNG LƯỢC DẬP CHIẾU (CÂY DẬP) CĂNG SỢI ĐAY DỌC
        const loomBeaterGroup = new THREE.Group();
        loomBeaterGroup.position.set(0, 0.09, 0.24);

        const beaterBeam = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.035, 0.025), polishedShuttle);
        loomBeaterGroup.add(beaterBeam);

        // Các sợi chỉ đay căng dọc
        for (let jx = -0.32; jx <= 0.32; jx += 0.04) {
          const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.24, 3), juteThread);
          thread.rotation.x = Math.PI / 2.3;
          thread.position.set(jx, -0.04, -0.08);
          loomBeaterGroup.add(thread);
        }
        g.add(loomBeaterGroup);

        // 3. CUỘN CHIẾU TRÒN NẰM NGANG
        const rollGroup = new THREE.Group();
        rollGroup.position.set(0, 0.11, -0.16);
        rollGroup.rotation.z = Math.PI / 2;

        const rollCore = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.68, 32), strawNatural);
        rollGroup.add(rollCore);

        const rBand1 = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.10, 32), redSedge);
        rBand1.position.y = 0.20;
        rollGroup.add(rBand1);

        const rBand2 = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.10, 32), indigoSedge);
        rBand2.position.y = -0.20;
        rollGroup.add(rBand2);

        const rBand3 = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.08, 32), goldSedge);
        rBand3.position.y = 0;
        rollGroup.add(rBand3);

        g.add(rollGroup);

        // 4. BÓ CÓI KHÔ & NHUỘM ĐỎ CÓ LẠT BUỘC
        const bundleGroup = new THREE.Group();
        bundleGroup.position.set(-0.28, 0.05, 0.10);
        bundleGroup.rotation.x = Math.PI / 2;
        bundleGroup.rotation.z = -0.55;

        const strawPart = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 12), strawNatural);
        bundleGroup.add(strawPart);

        const redDyePart = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.14, 12), redSedge);
        redDyePart.position.y = 0.06;
        bundleGroup.add(redDyePart);

        const strawTie = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.008, 6, 16), goldSedge);
        strawTie.rotation.x = Math.PI / 2;
        bundleGroup.add(strawTie);

        g.add(bundleGroup);

        // 5. CON THOI DỆT GỖ BÓNG CÓ LÕI CUỘN SỢI TRẮNG
        const shuttleGroup = new THREE.Group();
        shuttleGroup.position.set(0.24, 0.035, 0.12);
        shuttleGroup.rotation.z = 1.15;
        shuttleGroup.rotation.x = 0.2;

        const shuttle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.032, 0.30, 10), polishedShuttle);
        shuttleGroup.add(shuttle);

        const bobbinThread = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.10, 8), juteThread);
        shuttleGroup.add(bobbinThread);

        g.add(shuttleGroup);
        break;
      }

      // -------------------------------------------------------------
      // 7. BÁNH CÁY LÀNG NGUYỄN (khay-banh)
      // Khay sơn mài đen bóng khảm xà cừ hoa cúc đa sắc viền đồng
      // Tháp bánh 3 tầng lốm đốm 3 màu + LÁT BÁNH CẮT ĐÔI LỘ RUỘT CỐM GẤC GỪNG MỠ ĐƯỜNG +
      // ẤM TRÀ GỐM ĐẤT NUNG VÒI CONG & CHÉN TRÀ XANH SÓNG SÁNH
      // -------------------------------------------------------------
      case 'khay-banh': {
        const blackLacquerNacre = new THREE.MeshStandardMaterial({
          color: 0x100c0a,
          roughness: 0.12,
          metalness: 0.35
        });
        const nacreFleck = new THREE.MeshBasicMaterial({ color: 0xc8e6c9 });
        const yellowPuffedRice = new THREE.MeshStandardMaterial({ color: 0xf5b700, roughness: 0.7 });
        const redGacFruit = new THREE.MeshStandardMaterial({ color: 0xdb441a, roughness: 0.7 });
        const whitePuffedRice = new THREE.MeshStandardMaterial({ color: 0xfffaed, roughness: 0.65 });
        const gingerSliver = new THREE.MeshStandardMaterial({ color: 0xffe082, roughness: 0.5 });
        const terracottaTea = new THREE.MeshStandardMaterial({ color: 0x8d4428, roughness: 0.45 });

        // 1. KHAY SƠN MÀI ĐEN KHẢM XÀ CỪ
        const trayGroup = new THREE.Group();
        trayGroup.position.set(-0.06, 0.02, 0);

        const trayBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.035, 32), blackLacquerNacre);
        trayGroup.add(trayBase);

        const trayBrassRim = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.014, 8, 32), materials.brassGold);
        trayBrassRim.rotation.x = Math.PI / 2;
        trayBrassRim.position.y = 0.02;
        trayGroup.add(trayBrassRim);

        // Khảm xà cừ hình hoa cúc
        const nacreCount = 12;
        for (let i = 0; i < nacreCount; i++) {
          const nang = (i * Math.PI * 2) / nacreCount;
          const nr = 0.28 + (i % 3) * 0.03;
          const nDot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 6), nacreFleck);
          nDot.rotation.x = -Math.PI / 2;
          nDot.position.set(Math.cos(nang) * nr, 0.02, Math.sin(nang) * nr);
          trayGroup.add(nDot);
        }

        // 2. KHỐI BÁNH XẾP THÁP 3 TẦNG
        const cubeS = 0.07;
        const cubeGeo = new THREE.BoxGeometry(cubeS, cubeS, cubeS);

        // TẦNG 1 (3x3)
        const t1 = [-0.08, 0, 0.08];
        t1.forEach((cx, ix) => {
          t1.forEach((cz, iz) => {
            let colMat = yellowPuffedRice;
            if ((ix + iz) % 3 === 1) colMat = redGacFruit;
            else if ((ix + iz) % 3 === 2) colMat = whitePuffedRice;

            const cube = new THREE.Mesh(cubeGeo, colMat);
            cube.position.set(cx, 0.055, cz);
            trayGroup.add(cube);
          });
        });

        // TẦNG 2 (2x2)
        const t2 = [-0.04, 0.04];
        t2.forEach((cx, ix) => {
          t2.forEach((cz, iz) => {
            let colMat = (ix === iz) ? redGacFruit : yellowPuffedRice;
            const cube = new THREE.Mesh(cubeGeo, colMat);
            cube.position.set(cx, 0.125, cz);
            trayGroup.add(cube);
          });
        });

        // TẦNG 3
        const topCube = new THREE.Mesh(cubeGeo, yellowPuffedRice);
        topCube.position.set(0, 0.195, 0);
        trayGroup.add(topCube);

        // Sợi mứt gừng cong
        const ginger1 = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 12, Math.PI * 0.9), gingerSliver);
        ginger1.rotation.x = Math.PI / 2.5;
        ginger1.position.set(0, 0.24, 0);
        trayGroup.add(ginger1);

        // Vừng lạc rải rác
        const sesameMat = new THREE.MeshBasicMaterial({ color: 0x4a2e18 });
        const peanutMat = new THREE.MeshBasicMaterial({ color: 0xf5deb3 });
        for (let s = 0; s < 8; s++) {
          const sMesh = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), (s % 2 === 0) ? sesameMat : peanutMat);
          sMesh.position.set((Math.random() - 0.5) * 0.12, 0.20 + Math.random() * 0.04, (Math.random() - 0.5) * 0.12);
          trayGroup.add(sMesh);
        }

        // LÁT BÁNH CÁY CẮT ĐÔI BÊN CẠNH
        const sliceCake = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.06), yellowPuffedRice);
        sliceCake.position.set(0.18, 0.04, 0.08);
        sliceCake.rotation.y = 0.4;
        trayGroup.add(sliceCake);

        const sliceRedFleck = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.062), redGacFruit);
        sliceRedFleck.position.set(0.18, 0.04, 0.08);
        sliceRedFleck.rotation.y = 0.4;
        trayGroup.add(sliceRedFleck);

        g.add(trayGroup);

        // 3. BỘ ẤM CHÉN TRÀ GỐM ĐẤT NUNG CỔ
        const teaSetGroup = new THREE.Group();
        teaSetGroup.position.set(0.24, 0.04, 0.08);

        // Ấm trà đất nung vòi cong nắp núm
        const teaPot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), terracottaTea);
        teaPot.scale.set(1.1, 0.85, 1.1);
        teaPot.position.set(0, 0.06, -0.06);
        teaSetGroup.add(teaPot);

        const teaSpout = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.08, 8), terracottaTea);
        teaSpout.rotation.z = -1.1;
        teaSpout.position.set(-0.08, 0.08, -0.06);
        teaSetGroup.add(teaSpout);

        const teaHandle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16, Math.PI), terracottaTea);
        teaHandle.position.set(0.075, 0.06, -0.06);
        teaHandle.rotation.z = -Math.PI / 2;
        teaSetGroup.add(teaHandle);

        // Chén trà nước chè xanh
        const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.035, 0.05, 16), terracottaTea);
        cupBody.position.set(-0.04, 0.025, 0.12);
        teaSetGroup.add(cupBody);

        const greenTea = new THREE.Mesh(new THREE.CircleGeometry(0.050, 16), new THREE.MeshBasicMaterial({ color: 0x5b8a3c }));
        greenTea.rotation.x = -Math.PI / 2;
        greenTea.position.set(-0.04, 0.045, 0.12);
        teaSetGroup.add(greenTea);

        g.add(teaSetGroup);
        break;
      }

      // -------------------------------------------------------------
      // 8. CỒN VÀNH (dio-rama-bien)
      // 4 Dải màu phù sa → Bùn → Nước cạn → Biển sâu
      // THÁP HẢI ĐĂNG CỒN VÀNH TRẮNG ĐỎ + Rừng sú vẹt rễ cọc chân kiềng +
      // THẢM HOA MUỐNG BIỂN TÍM + ĐÀN CÒ THÌA MỎ MUỖNG + Thuyền nan tre
      // -------------------------------------------------------------
      case 'dio-rama-bien': {
        const frameWood = new THREE.MeshStandardMaterial({ color: 0x2b1a11, roughness: 0.5 });
        const sandAlluvial = new THREE.MeshStandardMaterial({ color: 0xd6b77e, roughness: 0.95 });
        const wetMud = new THREE.MeshStandardMaterial({ color: 0x70583e, roughness: 0.9 });
        const shallowWater = new THREE.MeshStandardMaterial({
          color: 0x1d8a78,
          roughness: 0.15,
          metalness: 0.2,
          transparent: true,
          opacity: 0.8
        });
        const deepWater = new THREE.MeshStandardMaterial({
          color: 0x0f4c5c,
          roughness: 0.1,
          metalness: 0.3,
          transparent: true,
          opacity: 0.88
        });
        const leafGreen = new THREE.MeshStandardMaterial({ color: 0x205c38, roughness: 0.7 });
        const rootWood = new THREE.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.85 });
        const egretWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const coracleMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.8 });
        const purpleFlower = new THREE.MeshBasicMaterial({ color: 0xa855f7 });

        // 1. Khung diorama chữ nhật
        const dWidth = 0.84;
        const dLength = 0.64;
        const dHeight = 0.05;

        const boxBorder = new THREE.Mesh(new THREE.BoxGeometry(dWidth, dHeight, dLength), frameWood);
        boxBorder.position.y = dHeight / 2;
        g.add(boxBorder);

        const surfY = dHeight + 0.002;

        // Dải 1: Cát phù sa
        const stripSand = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), sandAlluvial);
        stripSand.rotation.x = -Math.PI / 2;
        stripSand.position.set(0, surfY, 0.22);
        g.add(stripSand);

        // Thảm hoa muống biển tím ven triền cát
        for (let fi = 0; fi < 12; fi++) {
          const flower = new THREE.Mesh(new THREE.CircleGeometry(0.008, 5), purpleFlower);
          flower.rotation.x = -Math.PI / 2;
          flower.position.set(-0.25 + fi * 0.045 + (Math.random() - 0.5) * 0.02, surfY + 0.003, 0.23 + (Math.random() - 0.5) * 0.04);
          g.add(flower);
        }

        // Dải 2: Bùn ướt
        const stripMud = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), wetMud);
        stripMud.rotation.x = -Math.PI / 2;
        stripMud.position.set(0, surfY, 0.10);
        g.add(stripMud);

        // Dải 3: Nước cạn
        const stripShallow = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), shallowWater);
        stripShallow.rotation.x = -Math.PI / 2;
        stripShallow.position.set(0, surfY + 0.001, 0.00);
        g.add(stripShallow);

        // Dải 4: Nước sâu
        const stripDeep = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.24), deepWater);
        stripDeep.rotation.x = -Math.PI / 2;
        stripDeep.position.set(0, surfY + 0.002, -0.16);
        g.add(stripDeep);

        // 2. THÁP HẢI ĐĂNG CỒN VÀNH (Trắng sọc đỏ, buồng đèn pha kính)
        const lightHouseGroup = new THREE.Group();
        lightHouseGroup.position.set(0.28, surfY, 0.22);

        const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }));
        lhBase.position.y = 0.11;
        lightHouseGroup.add(lhBase);

        const lhRedBand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 }));
        lhRedBand.position.y = 0.12;
        lightHouseGroup.add(lhRedBand);

        const lhLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 8), materials.glassCase);
        lhLantern.position.y = 0.24;
        lightHouseGroup.add(lhLantern);

        const lhDome = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.035, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
        lhDome.position.y = 0.275;
        lightHouseGroup.add(lhDome);

        g.add(lightHouseGroup);

        // 3. RỪNG SÚ VẸT RỄ CỌC CHÂN KIỀNG
        const treeXList = [-0.28, -0.16, -0.04, 0.08];
        treeXList.forEach((tx, idx) => {
          const th = 0.18 + (idx % 3) * 0.03;
          const tr = 0.085 + (idx % 2) * 0.02;

          const treeG = new THREE.Group();
          treeG.position.set(tx, surfY, 0.12 + (idx % 2) * 0.02);

          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, th, 8), rootWood);
          trunk.position.y = th / 2;
          treeG.add(trunk);

          const canopy = new THREE.Mesh(new THREE.SphereGeometry(tr, 12, 10), leafGreen);
          canopy.scale.set(1.1, 0.8, 1.1);
          canopy.position.y = th + 0.02;
          treeG.add(canopy);

          for (let r = 0; r < 4; r++) {
            const rang = (r * Math.PI) / 2;
            const rootStilt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.07, 6), rootWood);
            rootStilt.position.set(Math.cos(rang) * 0.025, 0.025, Math.sin(rang) * 0.025);
            rootStilt.rotation.x = Math.sin(rang) * 0.45;
            rootStilt.rotation.z = Math.cos(rang) * 0.45;
            treeG.add(rootStilt);
          }

          g.add(treeG);
        });

        // 4. 3 CON CÒ THÌA MỎ MUỖNG SẢI CÁNH BAY LƯỢN
        const egretPositions = [
          { x: -0.15, y: 0.28, z: -0.12, ry: 0.5 },
          { x: 0.10,  y: 0.36, z: -0.18, ry: 0.3 },
          { x: 0.20,  y: 0.24, z: -0.06, ry: 0.7 }
        ];

        egretPositions.forEach(ep => {
          const egretG = new THREE.Group();
          egretG.position.set(ep.x, ep.y, ep.z);
          egretG.rotation.y = ep.ry;

          const egBody = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.075, 4), egretWhite);
          egBody.rotation.x = Math.PI / 2;
          egretG.add(egBody);

          const egNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 4), egretWhite);
          egNeck.rotation.x = Math.PI / 3;
          egNeck.position.set(0, 0.02, 0.04);
          egretG.add(egNeck);

          const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.028), egretWhite);
          wingL.rotation.z = 0.4;
          wingL.position.set(-0.04, 0.015, 0);
          egretG.add(wingL);

          const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.028), egretWhite);
          wingR.rotation.z = -0.4;
          wingR.position.set(0.04, 0.015, 0);
          egretG.add(wingR);

          g.add(egretG);
        });

        // 5. THUYỀN NAN TRE TRÒN DẸT CÓ MÁI CHÈO
        const coracleBoat = new THREE.Group();
        coracleBoat.position.set(-0.18, surfY + 0.012, 0.08);
        coracleBoat.rotation.y = 0.4;

        const boatHull = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
          coracleMat
        );
        boatHull.scale.set(1.3, 0.4, 1.0);
        boatHull.rotation.x = Math.PI;
        coracleBoat.add(boatHull);

        const boatRim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 24), coracleMat);
        boatRim.scale.set(1.1, 0.9, 1.0);
        boatRim.rotation.x = Math.PI / 2;
        boatRim.position.y = 0.01;
        coracleBoat.add(boatRim);

        const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), rootWood);
        oar.rotation.z = 0.8;
        oar.position.set(0, 0.02, 0);
        coracleBoat.add(oar);

        g.add(coracleBoat);
        break;
      }

      default: {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), materials.brassGold);
        mesh.position.y = 0.2;
        g.add(mesh);
        break;
      }
    }

    return g;
  }

  // ==========================================================================
  // QUẢN LÝ ĐIỂM NHẤN VĂN HÓA (CULTURAL HOTSPOTS)
  // ==========================================================================
  function createHotspotSprite(hotspotData) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Vầng hào quang phát sáng vàng ấm
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255, 245, 200, 1)');
    grad.addColorStop(0.35, 'rgba(226, 190, 114, 0.95)');
    grad.addColorStop(0.7, 'rgba(212, 175, 95, 0.35)');
    grad.addColorStop(1, 'rgba(212, 175, 95, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    // Tâm tròn hổ phách viền trắng
    ctx.fillStyle = '#261b14';
    ctx.beginPath();
    ctx.arc(64, 64, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2be72';
    ctx.fillText('✦', 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.16, 0.16, 1);
    sprite.position.set(hotspotData.x, 1.05 + 0.02 + hotspotData.y, hotspotData.z);
    sprite.userData = {
      type: 'hotspot',
      data: hotspotData,
      baseScale: 0.16
    };

    return sprite;
  }

  function clearHotspots() {
    activeHotspotSprites.forEach(s => {
      if (s.parent) s.parent.remove(s);
      if (s.material) {
        if (s.material.map) s.material.map.dispose();
        s.material.dispose();
      }
    });
    activeHotspotSprites.length = 0;
    hideHotspotPopup();
  }

  function spawnHotspotsForArtifact(artifact) {
    clearHotspots();
    const group = pedestalGroups[artifact.id];
    if (!group || !artifact.diemNhan || artifact.diemNhan.length === 0) return;

    artifact.diemNhan.forEach(dn => {
      const sprite = createHotspotSprite(dn);
      group.add(sprite);
      activeHotspotSprites.push(sprite);
    });
  }

  function showHotspotPopup(hotspotData) {
    if (dom.hotspotTitle) dom.hotspotTitle.innerText = hotspotData.tieuDe;
    if (dom.hotspotDesc) dom.hotspotDesc.innerText = hotspotData.moTa;
    if (dom.hotspotPopup) {
      dom.hotspotPopup.classList.add('show');
      dom.hotspotPopup.setAttribute('aria-hidden', 'false');
    }
    cameraControl.lastInteraction = Date.now();
    SoundSystem.playClick();
  }

  function hideHotspotPopup() {
    if (dom.hotspotPopup) {
      dom.hotspotPopup.classList.remove('show');
      dom.hotspotPopup.setAttribute('aria-hidden', 'true');
    }
    cameraControl.lastInteraction = Date.now();
  }

  // Chức năng Chụp ảnh lưu niệm Di sản 3D (Heritage Snapshot)
  function takeHeritageSnapshot() {
    SoundSystem.playClick();
    const artifact = ARTIFACTS.find(a => a.id === APP_STATE.selectedArtifactId);
    const artName = artifact ? artifact.ten : 'Di sản Thái Bình';

    renderer.render(scene, camera);
    const glCanvas = renderer.domElement;

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = glCanvas.width;
    snapCanvas.height = glCanvas.height;
    const ctx = snapCanvas.getContext('2d');

    // Vẽ hình ảnh 3D WebGL
    ctx.drawImage(glCanvas, 0, 0);

    // Vẽ thanh viền lưu niệm hoàng kim phía dưới
    const barH = Math.max(54, Math.floor(snapCanvas.height * 0.085));
    const pad = Math.max(16, Math.floor(snapCanvas.width * 0.02));

    ctx.fillStyle = 'rgba(18, 14, 12, 0.90)';
    ctx.fillRect(0, snapCanvas.height - barH, snapCanvas.width, barH);

    ctx.strokeStyle = '#d4af5f';
    ctx.lineWidth = Math.max(2, Math.floor(snapCanvas.width * 0.0025));
    ctx.beginPath();
    ctx.moveTo(0, snapCanvas.height - barH);
    ctx.lineTo(snapCanvas.width, snapCanvas.height - barH);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(16, Math.floor(barH * 0.36))}px 'Cormorant Garamond', 'Playfair Display', serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(`🏛️ ${artName.toUpperCase()}`, pad, snapCanvas.height - barH / 2);

    ctx.fillStyle = '#d4af5f';
    ctx.font = `italic ${Math.max(11, Math.floor(barH * 0.24))}px 'Be Vietnam Pro', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('Bảo tàng số Di sản Thái Bình — Dự án KHKT', snapCanvas.width - pad, snapCanvas.height - barH / 2);

    try {
      const dataUrl = snapCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeId = artifact ? artifact.id : 'di-san-thai-binh';
      link.download = `bao-tang-so-${safeId}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showHintTemporarily('LƯU ẢNH', `Đã lưu ảnh lưu niệm "${artName}" thành công!`, 3200);
    } catch (err) {
      console.warn('Snapshot error:', err);
    }
  }

  // ==========================================================================
  // 5. ĐIỀU HƯỚNG PHÒNG & CHUYỂN CẢNH CAMERA (STATE MACHINE) — SỬA LỖI 5
  // ==========================================================================
  function enterThaiBinhRoom() {
    if (APP_STATE.currentView === 'transition') return;
    APP_STATE.currentView = 'transition';

    clearHotspots();
    SoundSystem.playBell(480, 2.6);

    if (!thaiBinhRoomGroup) {
      buildThaiBinhRoom();
    }
    if (!scene.children.includes(thaiBinhRoomGroup)) {
      scene.add(thaiBinhRoomGroup);
    }

    const entranceTarget = new THREE.Vector3(0, 1.7, 8.5);
    const entranceLookAt = new THREE.Vector3(0, 1.5, 0);

    animateCamera({
      targetPos: entranceTarget,
      targetLookAt: entranceLookAt,
      duration: APP_STATE.reducedMotion ? 50 : 1200,
      onComplete: () => {
        if (lobbyGroup) {
          scene.remove(lobbyGroup);
        }
        APP_STATE.currentView = 'thaibinh_room';
        APP_STATE.currentRoomId = 'thaibinh';
        APP_STATE.selectedArtifactId = null;
        updateUI();
        showHintTemporarily('GIAN THÁI BÌNH', 'Click vào bệ hoặc danh mục dưới đáy để ngắm hiện vật', 4000);
      }
    });
  }

  function returnToLobby() {
    if (APP_STATE.currentView === 'transition') return;
    APP_STATE.currentView = 'transition';

    closeDrawer();
    clearHotspots();
    SoundSystem.playClick();

    if (dom.btnRotate) dom.btnRotate.classList.add('hidden');
    if (dom.btnSnapshot) dom.btnSnapshot.classList.add('hidden');
    dom.bottomDock.classList.add('hidden');
    dom.bottomDock.style.display = 'none';

    // Tắt shadow của các spotlight riêng lẻ để tiết kiệm GPU
    Object.keys(pedestalSpotlights).forEach(id => {
      pedestalSpotlights[id].castShadow = false;
    });

    if (lobbyGroup && !scene.children.includes(lobbyGroup)) {
      scene.add(lobbyGroup);
    }

    const lobbyTarget = new THREE.Vector3(0, 1.7, 3.5);
    const lobbyLookAt = new THREE.Vector3(0, 1.7, -2.0);

    animateCamera({
      targetPos: lobbyTarget,
      targetLookAt: lobbyLookAt,
      duration: APP_STATE.reducedMotion ? 50 : 1200,
      onComplete: () => {
        if (thaiBinhRoomGroup) {
          scene.remove(thaiBinhRoomGroup);
        }
        APP_STATE.currentView = 'lobby';
        APP_STATE.currentRoomId = null;
        APP_STATE.selectedArtifactId = null;
        updateUI();
        showHintTemporarily('TIỀN SẢNH', 'Click vào Cổng Vòm để vào gian trưng bày', 4000);
      }
    });
  }

  function viewRoomOverview() {
    if (APP_STATE.currentView === 'lobby') {
      animateCamera({
        targetPos: new THREE.Vector3(0, 1.7, 3.5),
        targetLookAt: new THREE.Vector3(0, 1.7, -2.0),
        duration: 900
      });
    } else if (APP_STATE.currentRoomId === 'thaibinh') {
      closeDrawer();
      clearHotspots();
      SoundSystem.playClick();

      if (dom.btnRotate) dom.btnRotate.classList.add('hidden');
      if (dom.btnSnapshot) dom.btnSnapshot.classList.add('hidden');

      // Tắt shadow của các spotlight riêng lẻ để giữ vững 60 FPS
      Object.keys(pedestalSpotlights).forEach(id => {
        pedestalSpotlights[id].castShadow = false;
      });

      APP_STATE.selectedArtifactId = null;
      APP_STATE.currentView = 'thaibinh_room';
      cameraControl.isOrbiting = false;

      animateCamera({
        targetPos: new THREE.Vector3(0, 1.7, 8.5),
        targetLookAt: new THREE.Vector3(0, 1.5, 0),
        duration: 900,
        onComplete: () => {
          updateUI();
        }
      });
    }
  }

  // Cố định vị trí đứng: luôn đứng ở PHÍA TRƯỚC mặt chính diện (+Z) của hiện vật
  function focusArtifact(artifactId) {
    const artifact = ARTIFACTS.find(a => a.id === artifactId);
    if (!artifact) return;

    if (APP_STATE.currentView === 'lobby') {
      enterThaiBinhRoom();
      setTimeout(() => {
        focusArtifact(artifactId);
      }, APP_STATE.reducedMotion ? 100 : 1300);
      return;
    }

    APP_STATE.selectedArtifactId = artifactId;
    APP_STATE.currentView = 'artifact_focus';
    cameraControl.lastInteraction = Date.now();

    // Bật shadow độ nét cao cho duy nhất spotlight của hiện vật đang xem (Tối ưu GPU)
    Object.keys(pedestalSpotlights).forEach(id => {
      pedestalSpotlights[id].castShadow = (id === artifactId);
    });

    // Tạo các điểm ghim chú giải văn hóa (Cultural Hotspots)
    spawnHotspotsForArtifact(artifact);

    // Hiển thị nút xoay 360° và nút chụp ảnh lưu niệm
    if (dom.btnRotate) {
      dom.btnRotate.classList.remove('hidden');
      dom.btnRotate.classList.toggle('active', cameraControl.autoRotate);
      dom.btnRotate.setAttribute('aria-pressed', cameraControl.autoRotate ? 'true' : 'false');
      if (dom.rotateText) {
        dom.rotateText.innerText = cameraControl.autoRotate ? 'Đang xoay' : 'Xoay 360°';
      }
    }
    if (dom.btnSnapshot) {
      dom.btnSnapshot.classList.remove('hidden');
    }

    SoundSystem.playBell(560, 2.0);

    const { x, z } = artifact.toaDoKhongGian;
    const plinthCenter = new THREE.Vector3(x, 1.40, z);

    // Tất cả hiện vật đều quay mặt về hướng Nam (+Z) hướng ra lối đi chính
    // Do đó camera LUÔN LUÔN đứng ở phía trước (+Z) nhìn thẳng vào mặt chính diện
    const standOffsetX = (x < 0) ? 0.40 : -0.40; // hơi nghiêng góc 3/4 nhẹ
    const standOffsetZ = 1.85; // LUÔN LUÔN đứng phía trước (+Z)

    const targetPos = new THREE.Vector3(x + standOffsetX, 1.55, z + standOffsetZ);

    cameraControl.orbitTarget.copy(plinthCenter);
    cameraControl.orbitRadius = targetPos.distanceTo(plinthCenter);
    cameraControl.yaw = Math.atan2(targetPos.x - plinthCenter.x, targetPos.z - plinthCenter.z);
    cameraControl.pitch = 0.12;
    cameraControl.isOrbiting = true;

    animateCamera({
      targetPos: targetPos,
      targetLookAt: plinthCenter,
      duration: APP_STATE.reducedMotion ? 50 : 1000,
      onComplete: () => {
        openDrawer(artifact);
        updateUI();
        showHintTemporarily('CẬN CẢNH', 'Kéo chuột xoay · Lăn chuột phóng to · Click ✦ để xem chú giải chi tiết', 3800);
      }
    });
  }

  function animateCamera({ targetPos, targetLookAt, duration = 1000, onComplete = null }) {
    if (APP_STATE.reducedMotion || duration <= 0) {
      camera.position.copy(targetPos);
      cameraTween.currentLookAt.copy(targetLookAt);
      camera.lookAt(targetLookAt);
      if (onComplete) onComplete();
      return;
    }

    cameraTween.active = true;
    cameraTween.startTime = performance.now();
    cameraTween.duration = duration;
    cameraTween.startPos.copy(camera.position);
    cameraTween.targetPos.copy(targetPos);
    cameraTween.startLookAt.copy(cameraTween.currentLookAt);
    cameraTween.targetLookAt.copy(targetLookAt);
    cameraTween.onComplete = onComplete;
  }

  // ==========================================================================
  // XỬ LÝ SỰ KIỆN TƯƠNG TÁC
  // ==========================================================================
  // Biến theo dõi quãng đường di chuyển chuột để phân biệt giữa Click và Drag xoay
  let pointerStartX = 0;
  let pointerStartY = 0;
  let isPointerMoved = false;

  function setupEventListeners() {
    window.addEventListener('resize', onWindowResize, false);

    // Kéo chuột & cảm ứng
    dom.container.addEventListener('mousedown', onPointerDown, false);
    window.addEventListener('mousemove', onPointerMove, false);
    window.addEventListener('mouseup', onPointerUp, false);

    dom.container.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, false);

    // Lăn chuột để phóng to/thu nhỏ khi đang cận cảnh một hiện vật
    dom.container.addEventListener('wheel', onWheelZoom, { passive: false });

    // Click chọn vật thể
    dom.container.addEventListener('click', onCanvasClick, false);

    // Nút giao diện UI
    dom.btnBackLobby.addEventListener('click', returnToLobby);
    dom.btnOverview.addEventListener('click', viewRoomOverview);
    dom.btnCloseDrawer.addEventListener('click', closeDrawer);
    dom.btnHelp.addEventListener('click', () => dom.modalHelp.classList.add('open'));
    dom.btnCloseHelp.addEventListener('click', () => dom.modalHelp.classList.remove('open'));
    dom.modalHelp.addEventListener('click', (e) => {
      if (e.target === dom.modalHelp) dom.modalHelp.classList.remove('open');
    });

    // Nút Bật/Tắt Âm thanh
    if (dom.btnSound) {
      dom.btnSound.addEventListener('click', () => {
        const isEnabled = SoundSystem.toggle();
        if (dom.soundIcon) dom.soundIcon.innerText = isEnabled ? '🔊' : '🔇';
        dom.btnSound.classList.toggle('active', isEnabled);
        dom.btnSound.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
        if (isEnabled) SoundSystem.playClick();
      });
    }

    // Nút Bật/Tắt Tự động xoay 360° (Showroom mode)
    if (dom.btnRotate) {
      dom.btnRotate.addEventListener('click', () => {
        cameraControl.autoRotate = !cameraControl.autoRotate;
        dom.btnRotate.classList.toggle('active', cameraControl.autoRotate);
        dom.btnRotate.setAttribute('aria-pressed', cameraControl.autoRotate ? 'true' : 'false');
        if (dom.rotateText) {
          dom.rotateText.innerText = cameraControl.autoRotate ? 'Đang xoay' : 'Xoay 360°';
        }
        cameraControl.lastInteraction = Date.now();
        SoundSystem.playClick();
      });
    }

    // Nút Chụp ảnh lưu niệm Di sản
    if (dom.btnSnapshot) {
      dom.btnSnapshot.addEventListener('click', takeHeritageSnapshot);
    }

    // Nút Bắt đầu / Dừng Tham quan Tự động
    if (dom.btnTour) {
      dom.btnTour.addEventListener('click', () => {
        if (GuidedTour.active) {
          GuidedTour.stop();
        } else {
          GuidedTour.start();
        }
      });
    }
    if (dom.btnStopTour) {
      dom.btnStopTour.addEventListener('click', () => GuidedTour.stop());
    }

    // Nút Mở / Đóng Modal QR Di động
    if (dom.btnQr) {
      dom.btnQr.addEventListener('click', () => {
        if (dom.modalQr) {
          dom.modalQr.classList.add('open');
          if (dom.qrUrlInput) dom.qrUrlInput.value = window.location.href;
          drawSmartQRCode(window.location.href, dom.qrCodeCanvas);
          SoundSystem.playClick();
        }
      });
    }
    if (dom.btnCloseQr) {
      dom.btnCloseQr.addEventListener('click', () => {
        if (dom.modalQr) dom.modalQr.classList.remove('open');
      });
    }
    if (dom.modalQr) {
      dom.modalQr.addEventListener('click', (e) => {
        if (e.target === dom.modalQr) dom.modalQr.classList.remove('open');
      });
    }
    if (dom.btnCopyUrl) {
      dom.btnCopyUrl.addEventListener('click', () => {
        if (dom.qrUrlInput && dom.qrUrlInput.value) {
          navigator.clipboard.writeText(dom.qrUrlInput.value).then(() => {
            showHintTemporarily('ĐÃ SAO CHÉP', 'Đã sao chép đường link vào bộ nhớ tạm', 2500);
            SoundSystem.playClick();
          }).catch(() => {
            dom.qrUrlInput.select();
            document.execCommand('copy');
            showHintTemporarily('ĐÃ SAO CHÉP', 'Đã sao chép đường link', 2500);
          });
        }
      });
    }

    // Nút đóng Chú giải Hotspot
    if (dom.btnCloseHotspot) {
      dom.btnCloseHotspot.addEventListener('click', (e) => {
        e.stopPropagation();
        hideHotspotPopup();
      });
    }

    // Nút đóng Hint
    if (dom.btnCloseHint) {
      dom.btnCloseHint.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissHintPermanently();
      });
    }

    // Nút chuyển hiện vật trong Drawer
    dom.btnPrevArtifact.addEventListener('click', () => navigateArtifact(-1));
    dom.btnNextArtifact.addEventListener('click', () => navigateArtifact(1));

    // Bàn phím điều hướng
    window.addEventListener('keydown', onKeyDown, false);
  }

  function applyOrbitCamera() {
    const r = cameraControl.orbitRadius;
    const target = cameraControl.orbitTarget;
    camera.position.x = target.x + r * Math.sin(cameraControl.yaw) * Math.cos(cameraControl.pitch);
    camera.position.y = target.y + r * Math.sin(cameraControl.pitch) + 0.15;
    camera.position.z = target.z + r * Math.cos(cameraControl.yaw) * Math.cos(cameraControl.pitch);
    cameraTween.currentLookAt.copy(target);
    camera.lookAt(target);
  }

  function onWheelZoom(e) {
    if (!cameraControl.isOrbiting || cameraTween.active) return;
    e.preventDefault();
    cameraControl.lastInteraction = Date.now();
    const zoomSensitivity = 0.0016;
    cameraControl.orbitRadius = Math.max(
      cameraControl.minOrbitRadius,
      Math.min(cameraControl.maxOrbitRadius, cameraControl.orbitRadius + e.deltaY * zoomSensitivity)
    );
    applyOrbitCamera();
  }

  function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    cameraControl.isDragging = true;
    cameraControl.prevMouseX = e.clientX;
    cameraControl.prevMouseY = e.clientY;
    cameraControl.yawVelocity = 0;
    cameraControl.pitchVelocity = 0;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    isPointerMoved = false;
    cameraControl.lastInteraction = Date.now();

    scheduleHintFade(1500);
  }

  function onPointerMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (cameraControl.isDragging && !cameraTween.active) {
      cameraControl.lastInteraction = Date.now();
      const moveDist = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);
      if (moveDist > 12) {
        isPointerMoved = true;
      }

      const deltaX = e.clientX - cameraControl.prevMouseX;
      const deltaY = e.clientY - cameraControl.prevMouseY;
      cameraControl.prevMouseX = e.clientX;
      cameraControl.prevMouseY = e.clientY;

      const sensitivity = 0.004;
      cameraControl.yawVelocity = -deltaX * sensitivity * 0.45;
      cameraControl.pitchVelocity = deltaY * sensitivity * 0.45;

      if (cameraControl.isOrbiting) {
        cameraControl.yaw -= deltaX * sensitivity;
        cameraControl.pitch = Math.max(-0.25, Math.min(0.65, cameraControl.pitch + deltaY * sensitivity));
        applyOrbitCamera();
      } else {
        cameraControl.yaw -= deltaX * sensitivity;
        cameraControl.pitch = Math.max(-0.45, Math.min(0.45, cameraControl.pitch - deltaY * sensitivity));

        const lookDir = new THREE.Vector3(
          Math.sin(cameraControl.yaw) * Math.cos(cameraControl.pitch),
          Math.sin(cameraControl.pitch),
          -Math.cos(cameraControl.yaw) * Math.cos(cameraControl.pitch)
        );
        cameraTween.currentLookAt.copy(camera.position).add(lookDir);
        camera.lookAt(cameraTween.currentLookAt);
      }
    } else if (!cameraTween.active) {
      // Con trỏ chuột chuyển thành hình bàn tay khi rê vào cổng hoặc hiện vật
      const activeObjects = getActiveInteractables();
      if (activeObjects.length > 0) {
        raycaster.setFromCamera(mouse, camera);
        const hoverHits = raycaster.intersectObjects(activeObjects, true);
        dom.container.style.cursor = hoverHits.length > 0 ? 'pointer' : 'default';
      } else {
        dom.container.style.cursor = 'default';
      }
    }
  }

  function onPointerUp() {
    cameraControl.isDragging = false;
  }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      cameraControl.isDragging = true;
      cameraControl.prevMouseX = e.touches[0].clientX;
      cameraControl.prevMouseY = e.touches[0].clientY;
      cameraControl.yawVelocity = 0;
      cameraControl.pitchVelocity = 0;
      pointerStartX = e.touches[0].clientX;
      pointerStartY = e.touches[0].clientY;
      isPointerMoved = false;
      cameraControl.lastInteraction = Date.now();
      scheduleHintFade(1500);
    } else if (e.touches.length === 2) {
      cameraControl.isDragging = false;
      cameraControl.prevPinchDist = getPinchDistance(e.touches);
      cameraControl.lastInteraction = Date.now();
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 1 && cameraControl.isDragging) {
      cameraControl.lastInteraction = Date.now();
      const moveDist = Math.hypot(e.touches[0].clientX - pointerStartX, e.touches[0].clientY - pointerStartY);
      if (moveDist > 12) {
        isPointerMoved = true;
      }
      onPointerMove({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      });
    } else if (e.touches.length === 2 && cameraControl.isOrbiting && !cameraTween.active) {
      e.preventDefault();
      cameraControl.lastInteraction = Date.now();
      const dist = getPinchDistance(e.touches);
      if (cameraControl.prevPinchDist != null) {
        const delta = dist - cameraControl.prevPinchDist;
        const zoomSensitivity = 0.006;
        cameraControl.orbitRadius = Math.max(
          cameraControl.minOrbitRadius,
          Math.min(cameraControl.maxOrbitRadius, cameraControl.orbitRadius - delta * zoomSensitivity)
        );
        applyOrbitCamera();
      }
      cameraControl.prevPinchDist = dist;
    }
  }

  function onTouchEnd(e) {
    cameraControl.isDragging = false;
    if (e.touches.length < 2) cameraControl.prevPinchDist = null;
  }

  function onCanvasClick(e) {
    if (cameraTween.active) return;
    // Bỏ qua click nếu người dùng vừa kéo chuột/cảm ứng để xoay góc nhìn
    if (isPointerMoved) return;

    // Nếu đang trong chế độ cận cảnh hiện vật, kiểm tra xem người dùng có click vào Hotspot không
    if (APP_STATE.currentView === 'artifact_focus') {
      if (activeHotspotSprites.length > 0) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hotspotHits = raycaster.intersectObjects(activeHotspotSprites, false);
        if (hotspotHits.length > 0) {
          const hit = hotspotHits[0].object;
          if (hit.userData && hit.userData.data) {
            showHotspotPopup(hit.userData.data);
          }
          return;
        }
      }
      // Click ra ngoài khoảng trống trong lúc focus thì đóng popup hotspot
      hideHotspotPopup();
      return;
    }

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const activeObjects = getActiveInteractables();
    const intersects = raycaster.intersectObjects(activeObjects, true);

    if (intersects.length > 0) {
      let hit = null;
      for (let i = 0; i < intersects.length; i++) {
        let obj = intersects[i].object;
        while (obj && !obj.userData.type && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData.type) {
          hit = obj;
          break;
        }
      }

      if (hit) {
        const u = hit.userData;

        if (u.type === 'portal') {
          if (u.gianId === 'thaibinh') {
            enterThaiBinhRoom();
          } else if (u.gianId === 'hungyen') {
            showLockedToast();
          }
        } else if (u.type === 'exit_portal') {
          returnToLobby();
        } else if (u.type === 'artifact' && u.id) {
          focusArtifact(u.id);
        }
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (dom.modalHelp && dom.modalHelp.classList.contains('open')) {
        dom.modalHelp.classList.remove('open');
      } else if (dom.modalQr && dom.modalQr.classList.contains('open')) {
        dom.modalQr.classList.remove('open');
      } else if (GuidedTour.active) {
        GuidedTour.stop();
      } else if (APP_STATE.currentView === 'artifact_focus' || APP_STATE.selectedArtifactId !== null || dom.drawer.classList.contains('open')) {
        viewRoomOverview();
      } else if (APP_STATE.currentRoomId === 'thaibinh' || APP_STATE.currentView === 'thaibinh_room') {
        returnToLobby();
      }
    } else if (e.key === 'f' || e.key === 'F') {
      PerfMonitor.toggle();
    } else if (e.key === 'Tab') {
      if (GuidedTour.active) GuidedTour.stop();
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      cycleArtifactsKeyboard(direction);
    } else if (e.key === 'Enter') {
      if (GuidedTour.active) GuidedTour.stop();
      if (hoveredObject && hoveredObject.userData && hoveredObject.userData.id) {
        focusArtifact(hoveredObject.userData.id);
      }
    }
  }

  function cycleArtifactsKeyboard(direction) {
    const list = ARTIFACTS.filter(a => a.gian === 'thaibinh');
    let idx = list.findIndex(a => a.id === APP_STATE.selectedArtifactId);
    if (idx === -1) {
      idx = (direction > 0) ? 0 : list.length - 1;
    } else {
      idx = (idx + direction + list.length) % list.length;
    }
    focusArtifact(list[idx].id);
  }

  function navigateArtifact(direction) {
    const list = ARTIFACTS.filter(a => a.gian === 'thaibinh');
    let idx = list.findIndex(a => a.id === APP_STATE.selectedArtifactId);
    if (idx !== -1) {
      const nextIdx = (idx + direction + list.length) % list.length;
      focusArtifact(list[nextIdx].id);
    }
  }

  function showLockedToast() {
    dom.toastLocked.classList.add('show');
    setTimeout(() => {
      dom.toastLocked.classList.remove('show');
    }, 2800);
  }

  // ==========================================================================
  // GIAO DIỆN UI, TABS & DRAWER
  // ==========================================================================
  function renderCategoryTabs() {
    dom.categoryTabs.innerHTML = '';

    const allTab = document.createElement('button');
    allTab.className = 'tab-btn active';
    allTab.innerHTML = '🏛️ Tất cả (8)';
    allTab.addEventListener('click', () => filterCategory('tat-ca', allTab));
    dom.categoryTabs.appendChild(allTab);

    NHOM.forEach(n => {
      const count = ARTIFACTS.filter(a => a.gian === 'thaibinh' && a.nhom === n.ma).length;
      const tab = document.createElement('button');
      tab.className = 'tab-btn';
      tab.innerHTML = `${n.icon} ${n.ten} (${count})`;
      tab.addEventListener('click', () => filterCategory(n.ma, tab));
      dom.categoryTabs.appendChild(tab);
    });
  }

  function filterCategory(catKey, clickedBtn) {
    APP_STATE.activeCategory = catKey;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');
    renderArtifactChips();
  }

  function renderArtifactChips() {
    dom.artifactsCarousel.innerHTML = '';
    const filtered = ARTIFACTS.filter(a => {
      if (a.gian !== 'thaibinh') return false;
      if (APP_STATE.activeCategory === 'tat-ca') return true;
      return a.nhom === APP_STATE.activeCategory;
    });

    filtered.forEach(a => {
      const catObj = NHOM.find(n => n.ma === a.nhom);
      const chip = document.createElement('div');
      chip.className = `artifact-chip ${APP_STATE.selectedArtifactId === a.id ? 'active' : ''}`;
      chip.innerHTML = `
        <span class="chip-tag">${catObj ? catObj.ten : ''}</span>
        <span class="chip-name">${a.ten}</span>
      `;
      chip.addEventListener('click', () => focusArtifact(a.id));
      dom.artifactsCarousel.appendChild(chip);
    });
  }

  function updateUI() {
    if (APP_STATE.currentView === 'lobby') {
      dom.locationCrumb.innerHTML = 'Tiền sảnh đón';
      dom.btnBackLobby.classList.add('hidden');
      dom.bottomDock.classList.add('hidden');
      dom.bottomDock.style.display = 'none';
      if (dom.hintTag) dom.hintTag.innerText = 'TIỀN SẢNH';
      if (dom.hintText) dom.hintText.innerText = 'Click vào Cổng Vòm để bước vào gian trưng bày';
    } else {
      const gianObj = GIAN.find(g => g.ma === APP_STATE.currentRoomId);
      let crumbHtml = gianObj ? gianObj.ten : 'Gian Trưng Bày';

      if (APP_STATE.selectedArtifactId) {
        const art = ARTIFACTS.find(a => a.id === APP_STATE.selectedArtifactId);
        const cat = NHOM.find(n => n.ma === art.nhom);
        if (cat) crumbHtml += ` <span class="crumb-sep">/</span> ${cat.ten}`;
        if (art) crumbHtml += ` <span class="crumb-sep">/</span> <span style="color:#fff;">${art.ten}</span>`;
      }

      dom.locationCrumb.innerHTML = crumbHtml;
      dom.btnBackLobby.classList.remove('hidden');
      dom.bottomDock.classList.remove('hidden');
      dom.bottomDock.style.display = 'flex';
      if (dom.hintTag) dom.hintTag.innerText = 'HƯỚNG DẪN';
      if (dom.hintText) dom.hintText.innerText = 'Kéo chuột để quan sát • Click hiện vật để xem chi tiết • Lăn chuột để phóng to • Esc để lùi';
    }

    renderArtifactChips();
  }

  function openDrawer(artifact) {
    const cat = NHOM.find(n => n.ma === artifact.nhom);
    dom.drawerBadge.innerText = cat ? `${cat.icon} ${cat.ten}` : 'DI SẢN VĂN HÓA';
    dom.drawerTitle.innerText = artifact.ten;
    dom.drawerLead.innerText = artifact.moTaNgan;
    dom.drawerStory.innerText = artifact.cauChuyen;
    dom.drawerFact.innerText = artifact.banCoBiet;
    dom.drawer.classList.add('open');
  }

  function closeDrawer() {
    dom.drawer.classList.remove('open');
  }

  function disposeGroup(group) {
    if (!group) return;
    group.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  // ==========================================================================
  // RENDER LOOP & CẬP NHẬT 3D BILLBOARD FADE
  // ==========================================================================
  function animate(time) {
    requestAnimationFrame(animate);

    // 1. Cập nhật Camera Tween
    if (cameraTween.active) {
      const elapsed = performance.now() - cameraTween.startTime;
      const progress = Math.min(1.0, elapsed / cameraTween.duration);
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      camera.position.lerpVectors(cameraTween.startPos, cameraTween.targetPos, ease);
      cameraTween.currentLookAt.lerpVectors(cameraTween.startLookAt, cameraTween.targetLookAt, ease);
      camera.lookAt(cameraTween.currentLookAt);

      if (progress >= 1.0) {
        cameraTween.active = false;
        if (cameraTween.onComplete) {
          cameraTween.onComplete();
          cameraTween.onComplete = null;
        }
      }
    }

    // 2. Quán tính xoay nhẹ khi thả chuột (Inertia Damping)
    if (!cameraControl.isDragging && !cameraTween.active && (Math.abs(cameraControl.yawVelocity) > 0.00008 || Math.abs(cameraControl.pitchVelocity) > 0.00008)) {
      if (cameraControl.isOrbiting) {
        cameraControl.yaw += cameraControl.yawVelocity;
        cameraControl.pitch = Math.max(-0.25, Math.min(0.65, cameraControl.pitch + cameraControl.pitchVelocity));
        applyOrbitCamera();
      }
      cameraControl.yawVelocity *= 0.90;
      cameraControl.pitchVelocity *= 0.90;
    }

    // 3. Tự động xoay 360° Showroom Mode khi đang xem cận cảnh và không tương tác
    const isHotspotPopupOpen = dom.hotspotPopup && dom.hotspotPopup.classList.contains('show');
    if (
      APP_STATE.currentView === 'artifact_focus' &&
      cameraControl.isOrbiting &&
      cameraControl.autoRotate &&
      !cameraControl.isDragging &&
      !cameraTween.active &&
      !isHotspotPopupOpen
    ) {
      if (Date.now() - cameraControl.lastInteraction > 3000) {
        cameraControl.yaw += 0.0012; // Tốc độ trôi êm ái (~4 độ/giây)
        applyOrbitCamera();
      }
    }

    // 4. Hiệu ứng nhịp đập (Pulsing) cho các điểm ghim chú giải di sản (Cultural Hotspots)
    if (activeHotspotSprites.length > 0) {
      const pulse = 1 + Math.sin(time * 0.005) * 0.15;
      for (let i = 0; i < activeHotspotSprites.length; i++) {
        const s = activeHotspotSprites[i];
        const base = (s.userData && s.userData.baseScale) || 0.16;
        s.scale.set(base * pulse, base * pulse, 1);
      }
    }

    // 5. Tự động tính khoảng cách và làm mờ Biển tên 3D Billboard
    if (APP_STATE.currentRoomId === 'thaibinh' && nameplateSprites.length > 0) {
      const camPos = camera.position;

      for (let i = 0; i < nameplateSprites.length; i++) {
        const sprite = nameplateSprites[i];
        const plinthPos = sprite.userData.parentPlinthPos;
        const dist = camPos.distanceTo(plinthPos);

        if (dist <= 4.5) {
          sprite.material.opacity = 0.95;
          sprite.visible = true;
        } else if (dist < 8.0) {
          const fade = 1.0 - (dist - 4.5) / 3.5;
          sprite.material.opacity = Math.max(0, fade * 0.9);
          sprite.visible = sprite.material.opacity > 0.05;
        } else {
          sprite.visible = false;
        }
      }
    }

    // 6. Cập nhật Bộ đo hiệu năng thời gian thực (FPS & Render Stats)
    PerfMonitor.update();

    // 7. Render khung hình
    renderer.render(scene, camera);
  }

  function startApp() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        init();
      }).catch(() => {
        init();
      });
    } else {
      init();
    }
  }

  window.addEventListener('DOMContentLoaded', startApp);

})();