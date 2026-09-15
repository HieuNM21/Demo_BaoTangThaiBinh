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

  // Quản lý Raycasting & Tương tác
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let interactableObjects = []; // Danh sách object có thể click (cổng, bệ, hiện vật)
  let hoveredObject = null;
  const pedestalSpotlights = {}; // Quản lý spotlight của từng bệ để bật/tắt shadow động
  const pedestalGroups = {};     // Quản lý Group bệ để gán Hotspot
  const activeHotspotSprites = []; // Danh sách Hotspot Sprite đang hiển thị

  // Quản lý Camera & Chuyển động (Animation)
  const cameraControl = {
    isDragging: false,
    prevMouseX: 0,
    prevMouseY: 0,
    yaw: 0,            // góc quay ngang (radians)
    pitch: 0,          // góc quay dọc (radians)
    targetYaw: 0,
    targetPitch: 0,
    orbitRadius: 2.2,
    orbitTarget: new THREE.Vector3(0, 1.4, 0),
    isOrbiting: false,
    autoRotate: true,  // Tự động xoay 360 độ khi xem cận cảnh (Showroom mode)
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
    toastLocked: document.getElementById('toast-locked')
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

    // 8. Bắt đầu Render Loop
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
    tex.repeat.set(5, 5);
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
    tex.repeat.set(8, 8);
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
    tex.repeat.set(2, 4);
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
    // Viền đồng vàng kim loại
    brassGold: new THREE.MeshStandardMaterial({ color: 0xd4af5f, roughness: 0.25, metalness: 0.88, bumpMap: bumpHammered, bumpScale: 0.008 }),
    // Bạc sáng chạm lộng (phản chiếu cao với bump gõ búa tinh vi)
    silverPure: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.12, metalness: 0.98, bumpMap: bumpHammered, bumpScale: 0.015 }),
    // Sơn mài son đỏ cổ
    lacquerRed: new THREE.MeshStandardMaterial({ color: 0x9b1b1b, roughness: 0.2, metalness: 0.15 }),
    // Gỗ lim / trắc sẫm màu
    ancientWood: new THREE.MeshStandardMaterial({ color: 0x422416, roughness: 0.65, metalness: 0.08, bumpMap: bumpWood, bumpScale: 0.025 }),
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

    // Đưa vào danh sách click được
    interactableObjects.push(doorMesh);

    parent.add(portalGroup);
  }

  // ==========================================================================
  // 2. DỰNG GIAN THÁI BÌNH (CÔ LẬP RIÊNG BIỆT) — SỬA LỖI 1 & 2
  // ==========================================================================
  function buildThaiBinhRoom() {
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
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(archW, archH - 0.3),
      new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0x3d2a1c,
        emissiveIntensity: 0.3
      })
    );
    door.position.set(0, archH / 2, -0.05);
    door.rotation.y = Math.PI;
    door.userData = { type: 'exit_portal' };
    portalGroup.add(door);

    interactableObjects.push(door);
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
    interactableObjects.push(plinthMesh);

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
        interactableObjects.push(child);
        // QUAN TRỌNG: trước đây các mesh chi tiết của hiện vật (cột, mái, mặt
        // nạ, hoa văn...) không đổ bóng lên nhau hay lên bệ — dù hình khối
        // dựng rất kỹ, thiếu đổ bóng khiến mọi chi tiết trông "phẳng", không
        // có chiều sâu dưới ánh đèn rọi gallery. Bật đổ bóng cho từng mesh.
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
  // 4. TẠO HÌNH HỌC CHI TIẾT CAO & ĐẶC TRƯNG CHO 8 HIỆN VẬT (BẢN CHỈNH SỬA CHUẨN XÁC)
  // ==========================================================================
  function createUniqueArtifactGeometry(artifact) {
    const g = new THREE.Group();
    const type = artifact.hinhDang;

    switch (type) {
      // -------------------------------------------------------------
      // 1. GÁC CHUÔNG CHÙA KEO (thap-tang-mai)
      // Tháp gỗ 3 tầng mái thu nhỏ, 4 góc mái mỗi tầng uốn cong vút (đầu đao)
      // Bệ đá tam cấp, 8 cột (4 cái, 4 quân), dầm mộng gỗ, cửa dàn quạt, đại hồng chung, tòa sen hồ lô
      // -------------------------------------------------------------
      case 'thap-tang-mai': {
        const limWood = new THREE.MeshStandardMaterial({ color: 0x3d2013, roughness: 0.65 });
        const roofTile = new THREE.MeshStandardMaterial({ color: 0x24150e, roughness: 0.7 });
        const blueStone = new THREE.MeshStandardMaterial({ color: 0x566068, roughness: 0.85 });
        const bronzeGilded = new THREE.MeshStandardMaterial({ color: 0xd4af5f, metalness: 0.88, roughness: 0.25 });
        const fanLatticeMat = new THREE.MeshStandardMaterial({ color: 0x5c331e, roughness: 0.6 });

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

        // 2. 8 Cột chia 2 lớp: 4 cột cái (trong, cao hơn) và 4 cột quân (ngoài, thấp hơn)
        // Mỗi cột có chân tảng đá đĩa tròn kê dưới đáy
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

        // Các dầm ngang mộng gỗ giằng nối các cột ở độ cao 1/3 thân
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

        // 3. TẦNG MÁI 1: Bốn góc có ĐẦU ĐAO CONG VÚT rõ rệt
        const roof1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.62, 0.11, 4, 1), roofTile);
        roof1.rotation.y = Math.PI / 4;
        roof1.position.y = 0.38;
        g.add(roof1);

        // Tạo 4 đầu đao cong vút ở 4 góc mái tầng 1 (khớp mép ngói)
        const corners = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        corners.forEach(ang => {
          taoDauDao(g, limWood, ang + Math.PI / 4, 0.58, 0.33, 1.0);
        });

        // 4. TẦNG 2: Lan can con tiện chạy vòng quanh & Cửa dàn quạt
        // Lan can con tiện
        const balustradeRail = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.015, 0.40), limWood);
        balustradeRail.position.y = 0.48;
        g.add(balustradeRail);

        // Con tiện tròn nhỏ đều nhau
        const balusterGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6);
        for (let bx = -0.18; bx <= 0.18; bx += 0.06) {
          const bFront = new THREE.Mesh(balusterGeo, limWood);
          bFront.position.set(bx, 0.45, 0.19);
          g.add(bFront);
          const bBack = new THREE.Mesh(balusterGeo, limWood);
          bBack.position.set(bx, 0.45, -0.19);
          g.add(bBack);
        }

        // Cửa dàn quạt (nan gỗ xòe hình nan quạt dạng hở)
        const fanDoor1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.015), fanLatticeMat);
        fanDoor1.position.set(0, 0.55, 0.14);
        g.add(fanDoor1);
        const fanDoor2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.015), fanLatticeMat);
        fanDoor2.position.set(0, 0.55, -0.14);
        g.add(fanDoor2);

        // Quả chuông đồng lớn bên trong có quai hình đầu rồng
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.115, 0.18, 16), bronzeGilded);
        bell.position.set(0, 0.54, 0);
        g.add(bell);

        const dragonQuai = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 16), bronzeGilded);
        dragonQuai.position.set(0, 0.65, 0);
        g.add(dragonQuai);

        // TẦNG MÁI 2: Đầu đao cong vút tầng 2
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

        // ĐỈNH THÁP: Tòa sen đỡ phía dưới + Bầu hồ lô đồng 2 khối cầu thắt eo
        const lotusPodium = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.04, 16), bronzeGilded);
        lotusPodium.position.y = 0.94;
        g.add(lotusPodium);

        // Bầu hồ lô: khối cầu dưới + khối cầu trên thắt eo
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
      // Bố cục theo trục: Nền đá 2 tầng có bậc tam cấp → Rùa đá cõng bia (tiền cảnh) → Gò mộ tròn thấp (hậu cảnh)
      // 4 trụ đá búp sen, trán bia chạm Lưỡng Long Chầu Nguyệt, Lư hương 3 chân tam cúc có than hồng
      // -------------------------------------------------------------
      case 'mo-dat-bia-da': {
        const stoneAsh = new THREE.MeshStandardMaterial({ color: 0x686e73, roughness: 0.85 });
        const steleStone = new THREE.MeshStandardMaterial({ color: 0x4e5458, roughness: 0.75 });
        const tumulusGrass = new THREE.MeshStandardMaterial({ color: 0x485838, roughness: 0.95 });
        const incenseBronze = new THREE.MeshStandardMaterial({ color: 0x7a7266, metalness: 0.5, roughness: 0.5 });
        const emberGlow = new THREE.MeshBasicMaterial({ color: 0xff3b00 });

        // 1. Nền đá 2 tầng, mỗi tầng có bậc tam cấp riêng dẫn lên
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

        // 2. 4 Trụ đá ở 4 góc đánh dấu ranh giới gò mộ, đỉnh trụ tạo hình BÚP SEN
        const postOffsets = [
          { x: -0.38, z: -0.30 }, { x: 0.38, z: -0.30 },
          { x: -0.38, z: 0.26 },  { x: 0.38, z: 0.26 }
        ];
        postOffsets.forEach(pos => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.045), stoneAsh);
          post.position.set(pos.x, 0.14, pos.z);
          g.add(post);

          const lotusBud = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 8), stoneAsh);
          lotusBud.position.set(pos.x, 0.24, pos.z);
          g.add(lotusBud);
        });

        // 3. GÒ MỘ TRÒN THẤP PHÍA SAU (Hậu cảnh: phủ màu đất cỏ xanh rêu)
        const tumulus = new THREE.Mesh(
          new THREE.SphereGeometry(0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          tumulusGrass
        );
        tumulus.scale.set(1.2, 0.55, 1.0);
        tumulus.position.set(0, 0.07, -0.12);
        g.add(tumulus);

        // 4. CỤM RÙA ĐÁ ĐỘI BIA (Tiền cảnh: đặt giữa bệ trước gò mộ)
        const tortoiseGroup = new THREE.Group();
        tortoiseGroup.position.set(0, 0.07, 0.10);

        // Mai rùa khum tròn khía vòm
        const turtleShell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), steleStone);
        turtleShell.scale.set(1.15, 0.5, 1.35);
        turtleShell.position.y = 0.04;
        tortoiseGroup.add(turtleShell);

        // Đầu rùa vươn dài ra phía trước
        const turtleHead = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 8), steleStone);
        turtleHead.rotation.x = Math.PI / 2.8;
        turtleHead.position.set(0, 0.05, 0.15);
        tortoiseGroup.add(turtleHead);

        // 4 Chân rùa bám vững
        const footGeo = new THREE.BoxGeometry(0.035, 0.025, 0.04);
        [[-0.10, 0.08], [0.10, 0.08], [-0.10, -0.08], [0.10, -0.08]].forEach(fp => {
          const foot = new THREE.Mesh(footGeo, steleStone);
          foot.position.set(fp[0], 0.015, fp[1]);
          tortoiseGroup.add(foot);
        });

        // Tấm bia đá chữ nhật đứng trên lưng rùa
        const steleBody = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.36, 0.045), steleStone);
        steleBody.position.set(0, 0.24, 0);
        tortoiseGroup.add(steleBody);

        // Trán bia chạm nổi hoa văn Lưỡng Long Chầu Nguyệt (vòm cuốn)
        const steleCrest = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.045, 24), steleStone);
        steleCrest.rotation.x = Math.PI / 2;
        steleCrest.position.set(0, 0.42, 0);
        tortoiseGroup.add(steleCrest);

        // Mặt nguyệt chạm nổi ở trán bia
        const moonEmblem = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), materials.brassGold);
        moonEmblem.position.set(0, 0.42, 0.024);
        tortoiseGroup.add(moonEmblem);

        g.add(tortoiseGroup);

        // 5. LƯ HƯƠNG ĐÁ 3 CHÂN (Tam cúc) miệng loe, cắm que hương có đốm than đỏ cam
        const burnerGroup = new THREE.Group();
        burnerGroup.position.set(0, 0.07, 0.28);

        // Miệng lư loe rộng
        const burnerBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.04, 0.07, 16), incenseBronze);
        burnerBowl.position.y = 0.055;
        burnerGroup.add(burnerBowl);

        // 3 Chân tam cúc choãi ra
        const legGeo = new THREE.CylinderGeometry(0.012, 0.01, 0.04, 6);
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Mesh(legGeo, incenseBronze);
          const lang = (i * Math.PI * 2) / 3;
          leg.position.set(Math.cos(lang) * 0.035, 0.02, Math.sin(lang) * 0.035);
          leg.rotation.z = Math.cos(lang) * 0.2;
          burnerGroup.add(leg);
        }

        // Tàn hương & que hương đang cháy
        const ashBed = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshBasicMaterial({ color: 0x444444 }));
        ashBed.rotation.x = -Math.PI / 2;
        ashBed.position.y = 0.091;
        burnerGroup.add(ashBed);

        // 3 Que hương cắm thẳng & nghiêng có đốm đỏ cam
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
      // Giá gỗ đứng treo 2 MẶT NẠ CẠNH NHAU (Hề Chèo & Đào Nữ) + Quạt giấy lụa nan tre + Gậy hề ngũ sắc
      // -------------------------------------------------------------
      case 'mat-na-cheo': {
        const ebonyWood = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.4, metalness: 0.2 });
        const clownSkin = new THREE.MeshStandardMaterial({ color: 0xf5dfc6, roughness: 0.4 });
        const daoSkin = new THREE.MeshStandardMaterial({ color: 0xfcf6ed, roughness: 0.25 });
        const redCheek = new THREE.MeshStandardMaterial({ color: 0xbf2626, roughness: 0.3 });
        const silkFanMat = new THREE.MeshStandardMaterial({ color: 0xfaebd7, roughness: 0.6, side: THREE.DoubleSide });
        const bambooRib = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });

        // 1. Giá gỗ mun đứng bóng bẩy có 2 cọc treo
        const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.035, 0.24), ebonyWood);
        standBase.position.y = 0.0175;
        g.add(standBase);

        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8), ebonyWood);
        postL.position.set(-0.13, 0.26, 0);
        g.add(postL);

        const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8), ebonyWood);
        postR.position.set(0.13, 0.26, 0);
        g.add(postR);

        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.018), ebonyWood);
        crossBar.position.set(0, 0.46, 0);
        g.add(crossBar);

        // 2. MẶT NẠ HỀ CHÈO (Bên trái): Miệng cười toe toét gần mang tai, búi tóc củ hành, 2 chấm má hồng
        const clownGroup = new THREE.Group();
        clownGroup.position.set(-0.13, 0.44, 0.06);

        const maskClown = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), clownSkin);
        maskClown.scale.set(1.05, 1.25, 0.45);
        clownGroup.add(maskClown);

        // Búi tóc nhỏ củ hành trên đỉnh đầu
        const topKnot = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), ebonyWood);
        topKnot.scale.set(1.0, 1.3, 0.9);
        topKnot.position.set(0, 0.16, 0);
        clownGroup.add(topKnot);

        // Mắt cười híp
        const eyeClownGeo = new THREE.TorusGeometry(0.024, 0.005, 6, 12, Math.PI);
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const eyeCL = new THREE.Mesh(eyeClownGeo, blackMat);
        eyeCL.position.set(-0.045, 0.035, 0.065);
        clownGroup.add(eyeCL);

        const eyeCR = new THREE.Mesh(eyeClownGeo, blackMat);
        eyeCR.position.set(0.045, 0.035, 0.065);
        clownGroup.add(eyeCR);

        // Miệng cười ngoác rộng kéo dài gần tới mang tai
        const wideMouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.010, 8, 16, Math.PI), redCheek);
        wideMouth.rotation.x = Math.PI;
        wideMouth.position.set(0, -0.035, 0.065);
        clownGroup.add(wideMouth);

        // 2 Chấm má hồng tròn rõ nét
        const cheekGeo = new THREE.CircleGeometry(0.022, 16);
        const chL = new THREE.Mesh(cheekGeo, redCheek);
        chL.position.set(-0.075, 0, 0.068);
        clownGroup.add(chL);

        const chR = new THREE.Mesh(cheekGeo, redCheek);
        chR.position.set(0.075, 0, 0.068);
        clownGroup.add(chR);

        g.add(clownGroup);

        // 3. MẶT NẠ ĐÀO NỮ (Bên phải): Mặt thon oval, mắt phượng xếch, lông mày con ngài cong mảnh, môi chúm đỏ
        const daoGroup = new THREE.Group();
        daoGroup.position.set(0.13, 0.44, 0.06);

        const maskDao = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), daoSkin);
        maskDao.scale.set(0.92, 1.35, 0.40);
        daoGroup.add(maskDao);

        // Mắt đuôi phượng dài xếch
        const eyeDaoGeo = new THREE.BoxGeometry(0.035, 0.005, 0.005);
        const eyeDL = new THREE.Mesh(eyeDaoGeo, blackMat);
        eyeDL.rotation.z = 0.25;
        eyeDL.position.set(-0.04, 0.04, 0.055);
        daoGroup.add(eyeDL);

        const eyeDR = new THREE.Mesh(eyeDaoGeo, blackMat);
        eyeDR.rotation.z = -0.25;
        eyeDR.position.set(0.04, 0.04, 0.055);
        daoGroup.add(eyeDR);

        // Lông mày cong mảnh hình con ngài
        const browGeo = new THREE.TorusGeometry(0.028, 0.003, 6, 12, Math.PI * 0.7);
        const browL = new THREE.Mesh(browGeo, blackMat);
        browL.position.set(-0.04, 0.065, 0.055);
        daoGroup.add(browL);

        const browR = new THREE.Mesh(browGeo, blackMat);
        browR.position.set(0.04, 0.065, 0.055);
        daoGroup.add(browR);

        // Môi nhỏ chúm son đỏ
        const lipDao = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), redCheek);
        lipDao.scale.set(1.3, 0.7, 0.7);
        lipDao.position.set(0, -0.045, 0.055);
        daoGroup.add(lipDao);

        g.add(daoGroup);

        // 4. QUẠT GIẤY LỤA XOÈ RỘNG HẾT CỠ LỘ RÕ TỪNG NAN TRE PHÍA SAU
        const fanGroup = new THREE.Group();
        fanGroup.position.set(0, 0.32, -0.06);
        fanGroup.rotation.z = -0.25;

        // Cánh quạt xòe
        const fanSilk = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24, 0, Math.PI * 0.88), silkFanMat);
        fanGroup.add(fanSilk);

        // Các nan tre lộ rõ
        const ribGeo = new THREE.BoxGeometry(0.004, 0.26, 0.003);
        for (let a = 0; a <= Math.PI * 0.88; a += Math.PI * 0.11) {
          const rib = new THREE.Mesh(ribGeo, bambooRib);
          rib.rotation.z = a - Math.PI / 2;
          rib.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.002);
          fanGroup.add(rib);
        }
        g.add(fanGroup);

        // 5. GẬY HỀ CHÈO NGŨ SẮC DỰA BÊN CẠNH (Đỏ, vàng, lam, trắng, đen)
        const batonGroup = new THREE.Group();
        batonGroup.position.set(0, 0.05, 0.10);
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
        break;
      }

      // -------------------------------------------------------------
      // 4. TRỐNG HỘI & RƯỚC KIỆU (trong-hoi)
      // Thân trống hình thùng phình giữa sơn đỏ rực, đai mây rồng thếp vàng, 2 hàng đinh tán đồng
      // Mặt da trâu vẽ họa tiết Thái Cực, giá đỡ chữ X đầu rồng, 2 dùi trống tua lụa vàng
      // -------------------------------------------------------------
      case 'trong-hoi': {
        const drumRedLacquer = new THREE.MeshStandardMaterial({ color: 0xb51a1a, roughness: 0.25, metalness: 0.2 });
        const buffaloSkin = new THREE.MeshStandardMaterial({ color: 0xdecba5, roughness: 0.8 });
        const goldRelief = new THREE.MeshStandardMaterial({ color: 0xd4af5f, metalness: 0.85, roughness: 0.25 });
        const darkWoodDragon = new THREE.MeshStandardMaterial({ color: 0x2e1910, roughness: 0.6 });

        // 1. Giá đỡ hình chữ X, hai đầu trên tạc hình đầu rồng
        const xLegGeo = new THREE.BoxGeometry(0.045, 0.60, 0.045);
        const legX1 = new THREE.Mesh(xLegGeo, darkWoodDragon);
        legX1.rotation.z = 0.44;
        legX1.position.set(-0.11, 0.25, 0);
        g.add(legX1);

        const legX2 = new THREE.Mesh(xLegGeo, darkWoodDragon);
        legX2.rotation.z = -0.44;
        legX2.position.set(0.11, 0.25, 0);
        g.add(legX2);

        // Đầu rồng tạc ở 2 mỏm trên chữ X
        const dragonHeadGeo = new THREE.ConeGeometry(0.035, 0.09, 6);
        const dHeadL = new THREE.Mesh(dragonHeadGeo, goldRelief);
        dHeadL.rotation.z = -1.2;
        dHeadL.position.set(-0.24, 0.48, 0);
        g.add(dHeadL);

        const dHeadR = new THREE.Mesh(dragonHeadGeo, goldRelief);
        dHeadR.rotation.z = 1.2;
        dHeadR.position.set(0.24, 0.48, 0);
        g.add(dHeadR);

        // Thanh giằng gỗ
        const crossBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 8), darkWoodDragon);
        crossBrace.rotation.x = Math.PI / 2;
        crossBrace.position.set(0, 0.12, 0);
        g.add(crossBrace);

        // 2. Thân trống hình thùng phình giữa (Bulging barrel shape)
        // Tạo khối thùng phình bằng cách ghép nón cụt
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

        // 3. Đai giữa thân trống chạm nổi hoa văn mây rồng thếp vàng
        const goldBand = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.09, 32), goldRelief);
        goldBand.rotation.x = Math.PI / 2;
        drumGroup.add(goldBand);

        // 4. Mặt da trâu vẽ họa tiết xoáy tròn kiểu Thái Cực
        const skinFront = new THREE.Mesh(new THREE.CircleGeometry(0.264, 32), buffaloSkin);
        skinFront.position.z = 0.221;
        drumGroup.add(skinFront);

        // Họa tiết xoáy Thái cực son đỏ ở giữa
        const yinYangCircle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), drumRedLacquer);
        yinYangCircle.position.z = 0.223;
        drumGroup.add(yinYangCircle);

        const skinBack = new THREE.Mesh(new THREE.CircleGeometry(0.264, 32), buffaloSkin);
        skinBack.rotation.y = Math.PI;
        skinBack.position.z = -0.221;
        drumGroup.add(skinBack);

        // 5. Hai hàng đinh tán đồng (chấm tròn nổi đều) viền quanh mép 2 mặt trống
        const rivetGeo = new THREE.SphereGeometry(0.008, 8, 8);
        const rivetCount = 20;
        for (let i = 0; i < rivetCount; i++) {
          const rang = (i * Math.PI * 2) / rivetCount;
          const rx = Math.cos(rang) * 0.26;
          const ry = Math.sin(rang) * 0.26;

          // Hàng đinh mặt trước
          const rivF = new THREE.Mesh(rivetGeo, goldRelief);
          rivF.position.set(rx, ry, 0.185);
          drumGroup.add(rivF);

          // Hàng đinh mặt sau
          const rivB = new THREE.Mesh(rivetGeo, goldRelief);
          rivB.position.set(rx, ry, -0.185);
          drumGroup.add(rivB);
        }

        g.add(drumGroup);

        // 6. Đôi dùi trống sơn son có tua lụa vàng dựa chéo bên cạnh
        const stickGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.40, 8);
        const stick1 = new THREE.Mesh(stickGeo, drumRedLacquer);
        stick1.rotation.z = -0.62;
        stick1.rotation.x = 0.25;
        stick1.position.set(0.30, 0.28, 0.16);
        g.add(stick1);

        // Tua lụa vàng buộc ở cán dùi
        const tassel1 = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.09, 8), goldRelief);
        tassel1.rotation.z = 0.85;
        tassel1.position.set(0.42, 0.14, 0.18);
        g.add(tassel1);
        break;
      }

      // -------------------------------------------------------------
      // 5. CHẠM BẠC ĐỒNG XÂM (mam-bac)
      // MÂM BỒNG CÓ CHÂN ĐẾ ĐỨNG (loe rộng trên, thu chân trụ dưới)
      // Chất liệu bạc sáng bóng phản chiếu kim loại cao (metalness 0.98)
      // Vành cúc dây, vòng 24 cánh sen, tâm Lưỡng Long Tranh Châu, kèm Vòng tay rồng & Cơi trầu bí ngô
      // -------------------------------------------------------------
      case 'mam-bac': {
        const mirrorSilver = new THREE.MeshStandardMaterial({
          color: 0xf8f8f8,
          metalness: 0.98,
          roughness: 0.12
        });

        // 1. MÂM BỒNG CÓ CHÂN ĐẾ (Stemmed Compote Platter)
        const pedestalCompote = new THREE.Group();
        pedestalCompote.position.set(0, 0.25, 0.04);
        pedestalCompote.rotation.x = -0.25; // Nghiêng nhẹ về phía người xem

        // Chân đế mâm bồng (loe đáy)
        const compoteFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.04, 32), mirrorSilver);
        compoteFoot.position.y = 0.02;
        pedestalCompote.add(compoteFoot);

        // Thân trụ thon đỡ đĩa mâm
        const compoteStem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 0.12, 32), mirrorSilver);
        compoteStem.position.y = 0.09;
        pedestalCompote.add(compoteStem);

        // Lòng mâm bồng loe rộng phía trên
        const dishPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.16, 0.04, 48), mirrorSilver);
        dishPlate.position.y = 0.16;
        pedestalCompote.add(dishPlate);

        // 2. Vành miệng mâm chạm nổi hoa văn cúc dây (đường uốn lượn liên tục)
        const rimChrysanthemum = new THREE.Mesh(new THREE.TorusGeometry(0.395, 0.018, 16, 48), mirrorSilver);
        rimChrysanthemum.rotation.x = Math.PI / 2;
        rimChrysanthemum.position.y = 0.18;
        pedestalCompote.add(rimChrysanthemum);

        // 3. Vòng trong 24 cánh sen đắp nổi chạy quanh
        const rimLotus24 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 12, 36), mirrorSilver);
        rimLotus24.rotation.x = Math.PI / 2;
        rimLotus24.position.y = 0.17;
        pedestalCompote.add(rimLotus24);

        // 4. Chính giữa lòng mâm chạm nổi Lưỡng Long Tranh Châu (viên ngọc & rồng)
        const flamingPearl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), materials.brassGold);
        flamingPearl.scale.set(1.0, 0.4, 1.0);
        flamingPearl.position.set(0, 0.17, 0);
        pedestalCompote.add(flamingPearl);

        const dragonReliefRing = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.010, 8, 24), mirrorSilver);
        dragonReliefRing.rotation.x = Math.PI / 2;
        dragonReliefRing.position.y = 0.17;
        pedestalCompote.add(dragonReliefRing);

        // 5. TRÊN MẶT MÂM: Chiếc vòng tay bạc hoa văn rồng uốn
        const dragonBracelet = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 12, 32), mirrorSilver);
        dragonBracelet.rotation.x = Math.PI / 2;
        dragonBracelet.position.set(-0.12, 0.20, 0.08);
        pedestalCompote.add(dragonBracelet);

        // 6. CƠI TRẦU BẠC HÌNH QUẢ BÍ NGÔ (thân tròn múi khía, núm nắp hình búp sen)
        const pumpkinGroup = new THREE.Group();
        pumpkinGroup.position.set(0.12, 0.22, -0.06);

        // Thân quả bí ngô múi khía
        const pumpkinCore = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), mirrorSilver);
        pumpkinCore.scale.set(1.15, 0.75, 1.15);
        pumpkinGroup.add(pumpkinCore);

        // Núm nắp hình búp sen nhỏ
        const lotusKnob = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.035, 8), materials.brassGold);
        lotusKnob.position.y = 0.065;
        pumpkinGroup.add(lotusKnob);

        pedestalCompote.add(pumpkinGroup);

        g.add(pedestalCompote);
        break;
      }

      // -------------------------------------------------------------
      // 6. DỆT CHIẾU HỚI (chieu-cuon)
      // Góc xưởng dệt: Tấm chiếu hoa chữ Thọ ngũ sắc quả trám + Cuộn chiếu tròn sọc màu + Bó cói khô tự nhiên & đỏ + Con thoi gỗ
      // -------------------------------------------------------------
      case 'chieu-cuon': {
        const strawNatural = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.85 });
        const redSedge = new THREE.MeshStandardMaterial({ color: 0xb52222, roughness: 0.85 });
        const indigoSedge = new THREE.MeshStandardMaterial({ color: 0x1f6e8c, roughness: 0.85 });
        const goldSedge = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.85 });
        const polishedShuttle = new THREE.MeshStandardMaterial({ color: 0x3d2012, roughness: 0.35, metalness: 0.1 });

        // 1. TẤM CHIẾU TRẢI PHẲNG: Hoa văn chữ "Thọ" ngũ sắc ở giữa & hoa văn quả trám làm nền
        const flatMat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.018, 0.54), strawNatural);
        flatMat.position.y = 0.009;
        g.add(flatMat);

        // Nền viền hoa văn quả trám hình thoi lặp lại
        const diamondBorder1 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.06), redSedge);
        diamondBorder1.position.set(0, 0.01, 0.16);
        g.add(diamondBorder1);

        const diamondBorder2 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.02, 0.06), redSedge);
        diamondBorder2.position.set(0, 0.01, -0.16);
        g.add(diamondBorder2);

        // Tâm chiếu dệt hoa văn chữ "Thọ" ngũ sắc (đối xứng vuông vắn)
        const thoMedallion = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.022, 0.18), indigoSedge);
        thoMedallion.position.set(0, 0.011, 0);
        g.add(thoMedallion);

        const thoCenterGold = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.024, 0.08), goldSedge);
        thoCenterGold.position.set(0, 0.012, 0);
        g.add(thoCenterGold);

        // 2. CUỘN CHIẾU TRÒN NẰM NGANG PHÍA SAU: Các dải màu xen kẽ quanh thân
        const rollGroup = new THREE.Group();
        rollGroup.position.set(0, 0.11, -0.16);
        rollGroup.rotation.z = Math.PI / 2;

        const rollCore = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.68, 32), strawNatural);
        rollGroup.add(rollCore);

        // Các dải màu xen kẽ vòng quanh thân
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

        // 3. BÓ CÓI KHÔ (Một phần vàng rơm tự nhiên, một phần nhuộm đỏ nổi bật)
        const bundleGroup = new THREE.Group();
        bundleGroup.position.set(-0.25, 0.05, 0.12);
        bundleGroup.rotation.x = Math.PI / 2;
        bundleGroup.rotation.z = -0.55;

        const strawPart = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 12), strawNatural);
        bundleGroup.add(strawPart);

        const redDyePart = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.14, 12), redSedge);
        redDyePart.position.y = 0.06;
        bundleGroup.add(redDyePart);

        // Lạt buộc rơm quanh bó cói
        const strawTie = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.008, 6, 16), goldSedge);
        strawTie.rotation.x = Math.PI / 2;
        bundleGroup.add(strawTie);

        g.add(bundleGroup);

        // 4. CON THOI DỆT GỖ BÓNG (hình thoi thon dài 2 đầu nhọn)
        const shuttle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.032, 0.30, 10), polishedShuttle);
        shuttle.rotation.z = 1.15;
        shuttle.rotation.x = 0.2;
        shuttle.position.set(0.20, 0.035, 0.15);
        g.add(shuttle);
        break;
      }

      // -------------------------------------------------------------
      // 7. BÁNH CÁY LÀNG NGUYỄN (khay-banh)
      // Khay sơn mài ĐEN BÓNG KHẢM XÀ CỪ lấp lánh viền đồng, tháp bánh 3 tầng LỐM ĐỐM 3 MÀU XEN KẼ
      // Sợi mứt gừng, vừng lạc rải rác & chén trà đất nung men rạn
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

        // 1. KHAY SƠN MÀI ĐEN BÓNG KHẢM XÀ CỪ TRÒN THẤP
        const trayGroup = new THREE.Group();
        trayGroup.position.set(-0.04, 0.02, 0);

        const trayBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.035, 32), blackLacquerNacre);
        trayGroup.add(trayBase);

        // Viền chỉ đồng chạy quanh mép khay
        const trayBrassRim = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.014, 8, 32), materials.brassGold);
        trayBrassRim.rotation.x = Math.PI / 2;
        trayBrassRim.position.y = 0.02;
        trayGroup.add(trayBrassRim);

        // Các đốm khảm xà cừ lấp lánh nhiều màu rải rác trên bề mặt khay
        const nacreCount = 12;
        for (let i = 0; i < nacreCount; i++) {
          const nang = (i * Math.PI * 2) / nacreCount;
          const nr = 0.28 + (i % 3) * 0.03;
          const nDot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 6), nacreFleck);
          nDot.rotation.x = -Math.PI / 2;
          nDot.position.set(Math.cos(nang) * nr, 0.02, Math.sin(nang) * nr);
          trayGroup.add(nDot);
        }

        // 2. KHỐI BÁNH XẾP THÁP 3 TẦNG THU NHỎ DẦN, BỀ MẶT LỐM ĐỐM 3 MÀU
        const cubeS = 0.07;
        const cubeGeo = new THREE.BoxGeometry(cubeS, cubeS, cubeS);

        // TẦNG 1 (Dưới cùng: 3x3 khối lốm đốm)
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

        // TẦNG 2 (Tầng giữa: 2x2 khối lốm đốm)
        const t2 = [-0.04, 0.04];
        t2.forEach((cx, ix) => {
          t2.forEach((cz, iz) => {
            let colMat = (ix === iz) ? redGacFruit : yellowPuffedRice;
            const cube = new THREE.Mesh(cubeGeo, colMat);
            cube.position.set(cx, 0.125, cz);
            trayGroup.add(cube);
          });
        });

        // TẦNG 3 (Đỉnh: 1 khối)
        const topCube = new THREE.Mesh(cubeGeo, yellowPuffedRice);
        topCube.position.set(0, 0.195, 0);
        trayGroup.add(topCube);

        // Sợi mứt gừng cong nhỏ màu vàng nhạt rải trên đỉnh
        const ginger1 = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 12, Math.PI * 0.9), gingerSliver);
        ginger1.rotation.x = Math.PI / 2.5;
        ginger1.position.set(0, 0.24, 0);
        trayGroup.add(ginger1);

        // Các chấm nhỏ li ti màu nâu (vừng) và be (lạc)
        const sesameMat = new THREE.MeshBasicMaterial({ color: 0x4a2e18 });
        const peanutMat = new THREE.MeshBasicMaterial({ color: 0xf5deb3 });
        for (let s = 0; s < 8; s++) {
          const sMesh = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), (s % 2 === 0) ? sesameMat : peanutMat);
          sMesh.position.set((Math.random() - 0.5) * 0.12, 0.20 + Math.random() * 0.04, (Math.random() - 0.5) * 0.12);
          trayGroup.add(sMesh);
        }

        g.add(trayGroup);

        // 3. CHÉN TRÀ ĐẤT NUNG NÂU ĐỎ ĐẶT CẠNH KHAY CÓ MEN RẠN & NƯỚC TRÀ XANH
        const teaCupGroup = new THREE.Group();
        teaCupGroup.position.set(0.25, 0.04, 0.14);

        const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.065, 16), terracottaTea);
        teaCupGroup.add(cupBody);

        const greenTea = new THREE.Mesh(new THREE.CircleGeometry(0.064, 16), new THREE.MeshBasicMaterial({ color: 0x5b8a3c }));
        greenTea.rotation.x = -Math.PI / 2;
        greenTea.position.y = 0.03;
        teaCupGroup.add(greenTea);

        g.add(teaCupGroup);
        break;
      }

      // -------------------------------------------------------------
      // 8. CỒN VÀNH (dio-rama-bien) — BẢN PHẲNG CHUẨN XÁC (KHÔNG CÒN TRÔNG NHƯ ĐẢO)
      // Toàn bộ gần như phẳng, chia thành 4 dải màu song song từ mép bờ ra biển sâu
      // Rừng sú vẹt hàng mỏng có rễ cọc chân kiềng mọc sát rìa bãi + 3 cò trắng sải cánh bay + Thuyền nan tre mép nước
      // -------------------------------------------------------------
      case 'dio-rama-bien': {
        const frameWood = new THREE.MeshStandardMaterial({ color: 0x2b1a11, roughness: 0.5 });
        const sandAlluvial = new THREE.MeshStandardMaterial({ color: 0xd6b77e, roughness: 0.95 }); // 1. Cát phù sa
        const wetMud = new THREE.MeshStandardMaterial({ color: 0x70583e, roughness: 0.9 });       // 2. Bùn ướt
        const shallowWater = new THREE.MeshStandardMaterial({                                     // 3. Nước cạn
          color: 0x1d8a78,
          roughness: 0.15,
          metalness: 0.2,
          transparent: true,
          opacity: 0.8
        });
        const deepWater = new THREE.MeshStandardMaterial({                                        // 4. Nước sâu (rộng nhất)
          color: 0x0f4c5c,
          roughness: 0.1,
          metalness: 0.3,
          transparent: true,
          opacity: 0.88
        });
        const leafGreen = new THREE.MeshStandardMaterial({ color: 0x205c38, roughness: 0.7 });
        const rootWood = new THREE.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.85 });
        const egretWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const coracleMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.8 }); // Thuyền nan tre

        // 1. Khung diorama chữ nhật thấp
        const dWidth = 0.84;
        const dLength = 0.64;
        const dHeight = 0.05;

        const boxBorder = new THREE.Mesh(new THREE.BoxGeometry(dWidth, dHeight, dLength), frameWood);
        boxBorder.position.y = dHeight / 2;
        g.add(boxBorder);

        // 2. CÁC DẢI MÀU SONG SONG TỪ MỘT CẠNH SANG CẠNH ĐỐI DIỆN TRÊN CÙNG MẶT PHẲNG (Z: -0.28 đến +0.28)
        const surfY = dHeight + 0.002;

        // Dải 1: Cát phù sa (be/nâu nhạt sát mép khung Z = +0.22)
        const stripSand = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), sandAlluvial);
        stripSand.rotation.x = -Math.PI / 2;
        stripSand.position.set(0, surfY, 0.22);
        g.add(stripSand);

        // Dải 2: Bùn ướt (nâu sẫm sát dải cát Z = +0.10)
        const stripMud = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), wetMud);
        stripMud.rotation.x = -Math.PI / 2;
        stripMud.position.set(0, surfY, 0.10);
        g.add(stripMud);

        // Dải 3: Nước cạn (xanh lục nhạt hơi trong Z = 0.00)
        const stripShallow = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), shallowWater);
        stripShallow.rotation.x = -Math.PI / 2;
        stripShallow.position.set(0, surfY + 0.001, 0.00);
        g.add(stripShallow);

        // Dải 4: Nước sâu (xanh lam đậm, chiếm phần rộng nhất Z: -0.06 đến -0.26)
        const stripDeep = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.24), deepWater);
        stripDeep.rotation.x = -Math.PI / 2;
        stripDeep.position.set(0, surfY + 0.002, -0.16);
        g.add(stripDeep);

        // 3. RỪNG SÚ VẸT MỌC THÀNH MỘT HÀNG MỎNG DỌC ĐÚNG RANH GIỚI CÁT-BÙN (Z ~ +0.12)
        // Mỗi cây có hệ RỄ CỌC CHÂN KIỀNG toả xiên từ gốc thân
        const treeXList = [-0.28, -0.16, -0.04, 0.08, 0.20];
        treeXList.forEach((tx, idx) => {
          const th = 0.18 + (idx % 3) * 0.03;
          const tr = 0.085 + (idx % 2) * 0.02;

          const treeG = new THREE.Group();
          treeG.position.set(tx, surfY, 0.12 + (idx % 2) * 0.02);

          // Thân cây
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, th, 8), rootWood);
          trunk.position.y = th / 2;
          treeG.add(trunk);

          // Tán lá ngập mặn
          const canopy = new THREE.Mesh(new THREE.SphereGeometry(tr, 12, 10), leafGreen);
          canopy.scale.set(1.1, 0.8, 1.1);
          canopy.position.y = th + 0.02;
          treeG.add(canopy);

          // Hệ rễ cọc chân kiềng (3-4 rễ tỏa xiên từ gốc cắm xuống bùn)
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

        // 4. 3 CON CÒ TRẮNG SẢI CÁNH BAY LƠ LỬNG PHÍA TRÊN VÙNG NƯỚC (ở độ cao khác nhau)
        const egretPositions = [
          { x: -0.15, y: 0.28, z: -0.12, ry: 0.5 },
          { x: 0.10,  y: 0.36, z: -0.18, ry: 0.3 },
          { x: 0.22,  y: 0.24, z: -0.06, ry: 0.7 }
        ];

        egretPositions.forEach(ep => {
          const egretG = new THREE.Group();
          egretG.position.set(ep.x, ep.y, ep.z);
          egretG.rotation.y = ep.ry;

          // Thân cò thon
          const egBody = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.075, 4), egretWhite);
          egBody.rotation.x = Math.PI / 2;
          egretG.add(egBody);

          // Cổ và mỏ dài
          const egNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 4), egretWhite);
          egNeck.rotation.x = Math.PI / 3;
          egNeck.position.set(0, 0.02, 0.04);
          egretG.add(egNeck);

          // Hai cánh sải chữ V đang bay
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

        // 5. THUYỀN NAN TRE TRÒN DẸT ĐẶT ĐÚNG RANH GIỚI CÁT-NƯỚC (Nửa chạm cát, nửa nổi trên nước cạn)
        const coracleBoat = new THREE.Group();
        coracleBoat.position.set(-0.18, surfY + 0.012, 0.08);
        coracleBoat.rotation.y = 0.4;

        // Thuyền thúng / thuyền nan tre tròn dẹt
        const boatHull = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
          coracleMat
        );
        boatHull.scale.set(1.3, 0.4, 1.0);
        boatHull.rotation.x = Math.PI;
        coracleBoat.add(boatHull);

        // Vành nan tre uốn quanh miệng thuyền
        const boatRim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 24), coracleMat);
        boatRim.scale.set(1.1, 0.9, 1.0);
        boatRim.rotation.x = Math.PI / 2;
        boatRim.position.y = 0.01;
        coracleBoat.add(boatRim);

        // Mái chèo gác ngang
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
    if (dom.hotspotPopup) dom.hotspotPopup.classList.add('show');
    SoundSystem.playClick();
  }

  function hideHotspotPopup() {
    if (dom.hotspotPopup) dom.hotspotPopup.classList.remove('show');
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

    // Hiển thị nút xoay 360°
    if (dom.btnRotate) {
      dom.btnRotate.classList.remove('hidden');
      dom.btnRotate.classList.toggle('active', cameraControl.autoRotate);
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
        if (isEnabled) SoundSystem.playClick();
      });
    }

    // Nút Bật/Tắt Tự động xoay 360° (Showroom mode)
    if (dom.btnRotate) {
      dom.btnRotate.addEventListener('click', () => {
        cameraControl.autoRotate = !cameraControl.autoRotate;
        dom.btnRotate.classList.toggle('active', cameraControl.autoRotate);
        if (dom.rotateText) {
          dom.rotateText.innerText = cameraControl.autoRotate ? 'Đang xoay' : 'Xoay 360°';
        }
        SoundSystem.playClick();
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
      if (moveDist > 5) {
        isPointerMoved = true;
      }

      const deltaX = e.clientX - cameraControl.prevMouseX;
      const deltaY = e.clientY - cameraControl.prevMouseY;
      cameraControl.prevMouseX = e.clientX;
      cameraControl.prevMouseY = e.clientY;

      const sensitivity = 0.004;

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
      if (moveDist > 5) {
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

    const intersects = raycaster.intersectObjects(interactableObjects, true);

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
      if (dom.modalHelp.classList.contains('open')) {
        dom.modalHelp.classList.remove('open');
      } else if (APP_STATE.currentView === 'artifact_focus' || APP_STATE.selectedArtifactId !== null || dom.drawer.classList.contains('open')) {
        viewRoomOverview();
      } else if (APP_STATE.currentRoomId === 'thaibinh' || APP_STATE.currentView === 'thaibinh_room') {
        returnToLobby();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      cycleArtifactsKeyboard(direction);
    } else if (e.key === 'Enter') {
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

    // 2. Tự động xoay 360° Showroom Mode khi đang xem cận cảnh và không tương tác
    if (APP_STATE.currentView === 'artifact_focus' && cameraControl.isOrbiting && cameraControl.autoRotate && !cameraControl.isDragging && !cameraTween.active) {
      if (Date.now() - cameraControl.lastInteraction > 1200) {
        cameraControl.yaw += 0.003;
        applyOrbitCamera();
      }
    }

    // 3. Hiệu ứng nhịp đập (Pulsing) cho các điểm ghim chú giải di sản (Cultural Hotspots)
    if (activeHotspotSprites.length > 0) {
      const pulse = 1 + Math.sin(time * 0.005) * 0.15;
      for (let i = 0; i < activeHotspotSprites.length; i++) {
        const s = activeHotspotSprites[i];
        const base = (s.userData && s.userData.baseScale) || 0.16;
        s.scale.set(base * pulse, base * pulse, 1);
      }
    }

    // 4. Tự động tính khoảng cách và làm mờ Biển tên 3D Billboard
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

    // 5. Render khung hình
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