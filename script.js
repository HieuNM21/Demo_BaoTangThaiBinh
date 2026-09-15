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
    isOrbiting: false
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
    modalHelp: document.getElementById('modal-help'),
    btnCloseHelp: document.getElementById('btn-close-help'),
    toastLocked: document.getElementById('toast-locked')
  };

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

    // 4. Khởi tạo Sảnh chính (Lobby)
    buildLobby();
    scene.add(lobbyGroup);
    APP_STATE.currentView = 'lobby';

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
  // VẬT LIỆU DÙNG CHUNG (PROCEDURAL & HIGH QUALITY MATERIALS)
  // ==========================================================================
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
    brassGold: new THREE.MeshStandardMaterial({ color: 0xd4af5f, roughness: 0.3, metalness: 0.85 }),
    // Bạc sáng chạm lộng
    silverPure: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.15, metalness: 0.96 }),
    // Sơn mài son đỏ cổ
    lacquerRed: new THREE.MeshStandardMaterial({ color: 0x9b1b1b, roughness: 0.2, metalness: 0.15 }),
    // Gỗ lim / trắc sẫm màu
    ancientWood: new THREE.MeshStandardMaterial({ color: 0x422416, roughness: 0.65, metalness: 0.08 }),
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
    ctx.font = 'bold 42px "Playfair Display", serif, "Times New Roman"';
    ctx.fillText('BẢO TÀNG SỐ DI SẢN VĂN HÓA', 512, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px "Playfair Display", serif, "Times New Roman"';
    ctx.fillText('THÁI BÌNH — HƯNG YÊN', 512, 200);

    ctx.fillStyle = '#c2b7a7';
    ctx.font = '30px "Be Vietnam Pro", sans-serif';
    ctx.fillText('Không gian trải nghiệm 3D di sản lịch sử & làng nghề truyền thống', 512, 280);

    ctx.fillStyle = '#e69d45';
    ctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
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
      ctx.font = 'bold 44px "Playfair Display", serif';
      ctx.fillText(title, 256, 260);

      ctx.fillStyle = '#ffffff';
      ctx.font = '28px "Be Vietnam Pro", sans-serif';
      ctx.fillText('8 Hiện vật Di sản', 256, 340);

      ctx.fillStyle = '#d4af5f';
      ctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
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
      ctx.font = 'bold 40px "Playfair Display", serif';
      ctx.fillText(title, 256, 260);

      ctx.font = '80px sans-serif';
      ctx.fillText('🔒', 256, 380);

      ctx.fillStyle = '#c2a16d';
      ctx.font = 'bold 26px "Be Vietnam Pro", sans-serif';
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
    ctx.font = 'bold 46px "Playfair Display", serif, "Times New Roman"';
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
    ctx.font = 'bold 44px "Playfair Display", serif';
    ctx.fillText('LỐI RA SẢNH CHÍNH', 256, 320);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "Be Vietnam Pro", sans-serif';
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
    const spot = new THREE.SpotLight(0xfff1db, 1.5, 10, Math.PI / 6, 0.45, 1.2);
    spot.position.set(x, 5.0, z);
    spot.target = plinthMesh;
    spot.castShadow = true;
    parent.add(spot);

    // 3. Dựng hiện vật 3D chi tiết cao
    const artifactMeshGroup = createUniqueArtifactGeometry(artifact);
    artifactMeshGroup.position.set(0, plinthH + 0.02, 0);
    artifactMeshGroup.userData = { type: 'artifact', id: artifact.id, artifactData: artifact };
    group.add(artifactMeshGroup);

    artifactMeshGroup.traverse(child => {
      if (child.isMesh) {
        child.userData = { type: 'artifact', id: artifact.id, artifactData: artifact };
        interactableObjects.push(child);
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
    npCtx.font = 'bold 22px "Be Vietnam Pro", sans-serif';
    npCtx.fillText((catObj ? catObj.ten.toUpperCase() : 'DI SẢN'), 30, 48);

    npCtx.fillStyle = '#ffffff';
    npCtx.font = 'bold 32px "Playfair Display", serif, "Times New Roman"';
    npCtx.fillText(artifact.ten, 30, 95);

    npCtx.fillStyle = '#d4af5f';
    npCtx.font = '18px "Be Vietnam Pro", sans-serif';
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

  // ==========================================================================
  // 4. TẠO HÌNH HỌC CHI TIẾT CAO & ĐẶC TRƯNG CHO 8 HIỆN VẬT — NÂNG CẤP CHI TIẾT
  // ==========================================================================
  function createUniqueArtifactGeometry(artifact) {
    const g = new THREE.Group();
    const type = artifact.hinhDang;

    switch (type) {
      // -------------------------------------------------------------
      // 1. GÁC CHUÔNG CHÙA KEO (thap-tang-mai) — ĐỈNH CAO MỘNG GỖ & ĐAO MÁI
      // -------------------------------------------------------------
      case 'thap-tang-mai': {
        const woodMat = materials.ancientWood;
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a190c, roughness: 0.65 });
        const bellMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, metalness: 0.85, roughness: 0.25 });
        const latticeMat = new THREE.MeshStandardMaterial({ color: 0x6e3b22, roughness: 0.6 });

        // Móng đá bậc tam cấp
        const stonePlinth = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.78), materials.ancientStone);
        stonePlinth.position.y = 0.03;
        g.add(stonePlinth);

        // Khung 4 cột cái lớn và 4 cột quân
        const pRadius = 0.022;
        const pHeight = 0.96;
        const colGeo = new THREE.CylinderGeometry(pRadius, pRadius, pHeight, 10);
        const colOffsets = [-0.22, 0.22];

        colOffsets.forEach(px => {
          colOffsets.forEach(pz => {
            const pillar = new THREE.Mesh(colGeo, woodMat);
            pillar.position.set(px, pHeight / 2 + 0.06, pz);
            g.add(pillar);

            // Chân tảng đá kê cột
            const baseStone = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.03, 8), materials.ancientStone);
            baseStone.position.set(px, 0.075, pz);
            g.add(baseStone);
          });
        });

        // Xà ngang giằng cột (Dầm mộng gỗ tầng 1)
        const beamGeo = new THREE.BoxGeometry(0.48, 0.025, 0.025);
        const b1 = new THREE.Mesh(beamGeo, woodMat);
        b1.position.set(0, 0.32, 0.22);
        g.add(b1);
        const b2 = new THREE.Mesh(beamGeo, woodMat);
        b2.position.set(0, 0.32, -0.22);
        g.add(b2);

        // TẦNG 1: Mái xòe rộng với 4 đầu đao cong vút ở 4 góc
        const roof1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.60, 0.12, 4, 1), roofMat);
        roof1.rotation.y = Math.PI / 4;
        roof1.position.y = 0.38;
        g.add(roof1);

        // 4 Đầu đao cong góc tầng 1
        const cornerAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        cornerAngles.forEach(ang => {
          const eave = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), woodMat);
          eave.rotation.x = -Math.PI / 3;
          eave.rotation.y = ang + Math.PI / 4;
          const ex = Math.cos(ang + Math.PI / 4) * 0.42;
          const ez = Math.sin(ang + Math.PI / 4) * 0.42;
          eave.position.set(ex, 0.44, ez);
          g.add(eave);
        });

        // TẦNG 2: Cửa dàn quạt (84 cánh cửa bức bàn) & Quả đại hồng chung
        const balustrade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), latticeMat);
        balustrade.position.y = 0.50;
        g.add(balustrade);

        // Quả chuông đồng cổ (Đại hồng chung) treo lơ lửng ở tầng 2
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.18, 16), bellMat);
        bell.position.y = 0.52;
        g.add(bell);

        // Quai treo chuông hình rồng
        const bellHanger = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 16), materials.brassGold);
        bellHanger.position.set(0, 0.62, 0);
        g.add(bellHanger);

        // TẦNG 2: Mái xòe thứ hai
        const roof2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.46, 0.10, 4, 1), roofMat);
        roof2.rotation.y = Math.PI / 4;
        roof2.position.y = 0.68;
        g.add(roof2);

        // TẦNG 3: Mái đỉnh nhỏ
        const roof3 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 0.09, 4, 1), roofMat);
        roof3.rotation.y = Math.PI / 4;
        roof3.position.y = 0.86;
        g.add(roof3);

        // Đỉnh tháp: Tòa sen đỡ quả hồ lô đồng
        const lotusBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.04, 12), materials.brassGold);
        lotusBase.position.y = 0.93;
        g.add(lotusBase);

        const gourdSpire = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), materials.brassGold);
        gourdSpire.scale.set(0.8, 1.4, 0.8);
        gourdSpire.position.y = 0.98;
        g.add(gourdSpire);

        const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 8), materials.brassGold);
        tipCone.position.y = 1.05;
        g.add(tipCone);
        break;
      }

      // -------------------------------------------------------------
      // 2. KHU LĂNG MỘ TAM ĐƯỜNG (mo-dat-bia-da) — RÙA ĐÁ ĐỘI BIA & LƯ HƯƠNG TAM CÚC
      // -------------------------------------------------------------
      case 'mo-dat-bia-da': {
        const stoneMat = materials.ancientStone;
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x3d5a30, roughness: 0.9 });
        const brickMat = new THREE.MeshStandardMaterial({ color: 0x824936, roughness: 0.8 });
        const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x7a6345, metalness: 0.7, roughness: 0.4 });

        // Bệ móng đá 2 tầng có bậc tam cấp
        const base1 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.72), brickMat);
        base1.position.y = 0.02;
        g.add(base1);

        const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.62), stoneMat);
        base2.position.y = 0.06;
        g.add(base2);

        // Gò mộ đất hoàng gia hình bán cầu thoải xanh mát
        const tumulus = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          grassMat
        );
        tumulus.scale.set(1.1, 0.8, 1.0);
        tumulus.position.set(-0.16, 0.08, 0);
        g.add(tumulus);

        // Trụ đá ranh giới gò mộ
        const postGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8);
        const pOffsets = [
          { x: -0.42, z: 0 }, { x: 0.10, z: 0 }, { x: -0.16, z: 0.26 }, { x: -0.16, z: -0.26 }
        ];
        pOffsets.forEach(pos => {
          const post = new THREE.Mesh(postGeo, stoneMat);
          post.position.set(pos.x, 0.12, pos.z);
          g.add(post);
        });

        // CỤM BIA ĐÁ NHÀ TRẦN: Rùa đá đội bia
        const turtleGroup = new THREE.Group();
        turtleGroup.position.set(0.26, 0.08, 0);

        // Thân rùa đá (mai rùa khum tròn)
        const turtleBody = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), stoneMat);
        turtleBody.scale.set(1.3, 0.5, 1.0);
        turtleBody.position.y = 0.04;
        turtleGroup.add(turtleBody);

        // Đầu rùa vươn về phía trước
        const turtleHead = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 8), stoneMat);
        turtleHead.rotation.z = -Math.PI / 3;
        turtleHead.position.set(0.14, 0.06, 0);
        turtleGroup.add(turtleHead);

        // Thân bia đá chữ nhật đứng vững chãi
        const steleBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.05), stoneMat);
        steleBody.position.set(0, 0.26, 0);
        turtleGroup.add(steleBody);

        // Trán bia chạm Lưỡng Long Chầu Nguyệt (vòm cuốn)
        const steleHead = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), stoneMat);
        steleHead.rotation.x = Math.PI / 2;
        steleHead.position.set(0, 0.45, 0);
        turtleGroup.add(steleHead);
        g.add(turtleGroup);

        // Lư hương đá tam cúc phía trước mộ
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.09, 12), bronzeMat);
        burner.position.set(-0.16, 0.12, 0.22);
        g.add(burner);

        // Nhang trầm đỏ thắp trong lư
        const stickGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.1, 4);
        const incenseMat = new THREE.MeshBasicMaterial({ color: 0xcc2200 });
        const inc1 = new THREE.Mesh(stickGeo, incenseMat);
        inc1.position.set(-0.16, 0.20, 0.22);
        g.add(inc1);

        const inc2 = new THREE.Mesh(stickGeo, incenseMat);
        inc2.rotation.z = 0.15;
        inc2.position.set(-0.14, 0.20, 0.22);
        g.add(inc2);
        break;
      }

      // -------------------------------------------------------------
      // 3. CHIẾU CHÈO LÀNG KHUỐC (mat-na-cheo) — BỘ MẶT NẠ HỀ CHÈO & QUẠT LỤA
      // -------------------------------------------------------------
      case 'mat-na-cheo': {
        const standMat = materials.ancientWood;
        const maskHeMat = new THREE.MeshStandardMaterial({ color: 0xf3dfc1, roughness: 0.35 });
        const maskDaoMat = new THREE.MeshStandardMaterial({ color: 0xfbf4ea, roughness: 0.3 });
        const redAccent = new THREE.MeshStandardMaterial({ color: 0xba2424, roughness: 0.3 });
        const fanMat = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.5, side: THREE.DoubleSide });
        const silkMat = new THREE.MeshStandardMaterial({ color: 0x2d8a6e, roughness: 0.4 });

        // Giá đỡ gỗ mun mỹ thuật
        const baseStand = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.22), standMat);
        baseStand.position.y = 0.02;
        g.add(baseStand);

        const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.52, 8), standMat);
        pole1.position.set(-0.12, 0.26, 0);
        g.add(pole1);

        const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 8), standMat);
        pole2.position.set(0.12, 0.24, 0);
        g.add(pole2);

        // 1. MẶT NẠ HỀ CHÈO (Bên trái: nụ cười dân gian hóm hỉnh)
        const heGroup = new THREE.Group();
        heGroup.position.set(-0.12, 0.45, 0.05);

        const maskHe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), maskHeMat);
        maskHe.scale.set(1.0, 1.2, 0.45);
        heGroup.add(maskHe);

        // Búi tóc củ hành / khăn xếp hề chèo
        const topKnot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), materials.plinthWood);
        topKnot.position.set(0, 0.18, 0);
        heGroup.add(topKnot);

        // Mắt cười tít
        const eyeGeo = new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI);
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const eyeL = new THREE.Mesh(eyeGeo, blackMat);
        eyeL.position.set(-0.05, 0.04, 0.08);
        heGroup.add(eyeL);

        const eyeR = new THREE.Mesh(eyeGeo, blackMat);
        eyeR.position.set(0.05, 0.04, 0.08);
        heGroup.add(eyeR);

        // Miệng hề chèo cười ngoác mang tai
        const mouthHe = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 16, Math.PI), redAccent);
        mouthHe.rotation.x = Math.PI;
        mouthHe.position.set(0, -0.04, 0.08);
        heGroup.add(mouthHe);

        // Hai chấm má hồng
        const cheekGeo = new THREE.CircleGeometry(0.025, 12);
        const cheekL = new THREE.Mesh(cheekGeo, redAccent);
        cheekL.position.set(-0.08, 0, 0.08);
        heGroup.add(cheekL);

        const cheekR = new THREE.Mesh(cheekGeo, redAccent);
        cheekR.position.set(0.08, 0, 0.08);
        heGroup.add(cheekR);
        g.add(heGroup);

        // 2. MẶT NẠ ĐÀO NỮ (Bên phải: thanh tú, mắt phượng mày ngài)
        const daoGroup = new THREE.Group();
        daoGroup.position.set(0.12, 0.42, 0.05);

        const maskDao = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), maskDaoMat);
        maskDao.scale.set(0.9, 1.25, 0.4);
        daoGroup.add(maskDao);

        // Môi trái tim đỏ thắm
        const lips = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), redAccent);
        lips.scale.set(1.4, 0.6, 0.6);
        lips.position.set(0, -0.04, 0.07);
        daoGroup.add(lips);
        g.add(daoGroup);

        // Chiếc quạt giấy lụa xòe nan tre phía sau
        const fan = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20, 0, Math.PI * 0.85), fanMat);
        fan.position.set(0, 0.32, -0.06);
        fan.rotation.z = -0.4;
        g.add(fan);

        // Gậy hề chèo quấn dải ngũ sắc gác ngang chân đế
        const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.38, 8), silkMat);
        baton.rotation.z = 1.2;
        baton.position.set(0, 0.06, 0.08);
        g.add(baton);
        break;
      }

      // -------------------------------------------------------------
      // 4. TRỐNG HỘI & RƯỚC KIỆU (trong-hoi) — ĐẠI CỔ SƠN SON THẾP VÀNG
      // -------------------------------------------------------------
      case 'trong-hoi': {
        const drumRed = materials.lacquerRed;
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0cca5, roughness: 0.75 });
        const goldStudMat = materials.brassGold;
        const frameMat = materials.ancientWood;

        // Giá đỡ trống chữ X chạm đầu rồng
        const legGeo = new THREE.BoxGeometry(0.045, 0.58, 0.045);
        const leg1 = new THREE.Mesh(legGeo, frameMat);
        leg1.rotation.z = 0.42;
        leg1.position.set(-0.11, 0.24, 0);
        g.add(leg1);

        const leg2 = new THREE.Mesh(legGeo, frameMat);
        leg2.rotation.z = -0.42;
        leg2.position.set(0.11, 0.24, 0);
        g.add(leg2);

        // Thanh giằng ngang giá đỡ
        const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), frameMat);
        brace.rotation.x = Math.PI / 2;
        brace.position.set(0, 0.12, 0);
        g.add(brace);

        // Thân trống đại hình thùng gỗ phình tang sơn đỏ rực
        const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.44, 32), drumRed);
        drumBody.rotation.x = Math.PI / 2;
        drumBody.position.set(0, 0.48, 0);
        g.add(drumBody);

        // Đai đục mây rồng thếp vàng quanh giữa tang trống
        const goldBelt = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.08, 32), materials.brassGold);
        goldBelt.rotation.x = Math.PI / 2;
        goldBelt.position.set(0, 0.48, 0);
        g.add(goldBelt);

        // Mặt da trâu bịt 2 đầu trống
        const skinFront = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), skinMat);
        skinFront.position.set(0, 0.48, 0.222);
        g.add(skinFront);

        // Họa tiết vòng xoáy Thái cực / hoa sen trên mặt da trống
        const yinYang = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.01, 8, 24), materials.lacquerRed);
        yinYang.position.set(0, 0.48, 0.224);
        g.add(yinYang);

        const skinBack = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), skinMat);
        skinBack.rotation.y = Math.PI;
        skinBack.position.set(0, 0.48, -0.222);
        g.add(skinBack);

        // Vành đinh tán đồng viền mép trống
        const studsFront = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.016, 8, 32), goldStudMat);
        studsFront.position.set(0, 0.48, 0.18);
        g.add(studsFront);

        const studsBack = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.016, 8, 32), goldStudMat);
        studsBack.position.set(0, 0.48, -0.18);
        g.add(studsBack);

        // Đôi dùi trống sơn son có chuỗi tua rua đỏ lụa
        const stickGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.38, 8);
        const stick1 = new THREE.Mesh(stickGeo, drumRed);
        stick1.rotation.z = -0.65;
        stick1.rotation.x = 0.25;
        stick1.position.set(0.30, 0.28, 0.16);
        g.add(stick1);

        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), materials.brassGold);
        tassel.rotation.z = 0.8;
        tassel.position.set(0.42, 0.15, 0.18);
        g.add(tassel);
        break;
      }

      // -------------------------------------------------------------
      // 5. CHẠM BẠC ĐỒNG XÂM (mam-bac) — MÂM BỒNG BẠC CHẠM LƯỠNG LONG & BỘ CƠI TRẦU
      // -------------------------------------------------------------
      case 'mam-bac': {
        const silverMat = materials.silverPure;
        const standMat = materials.ancientWood;

        // Giá đỡ chạm trổ mỹ nghệ
        const easel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.22), standMat);
        easel.position.set(0, 0.16, -0.05);
        g.add(easel);

        // Cụm Mâm bạc tròn
        const plateGroup = new THREE.Group();
        plateGroup.position.set(0, 0.35, 0.06);
        plateGroup.rotation.x = -0.32; // Nghiêng đón ánh sáng spotlight

        // Lòng mâm rộng
        const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.02, 48), silverMat);
        plateGroup.add(platter);

        // Vành viền hoa cúc dây chạm nổi quanh mép mâm
        const rimOuter = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.022, 16, 48), silverMat);
        rimOuter.rotation.x = Math.PI / 2;
        rimOuter.position.y = 0.015;
        plateGroup.add(rimOuter);

        // Vòng 24 cánh sen đắp nổi tinh xảo
        const rimLotus = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.016, 12, 32), silverMat);
        rimLotus.rotation.x = Math.PI / 2;
        rimLotus.position.y = 0.015;
        plateGroup.add(rimLotus);

        // Tâm mâm chạm nổi Lưỡng Long Tranh Châu
        const centerSun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), silverMat);
        centerSun.scale.set(1.0, 0.3, 1.0);
        centerSun.position.y = 0.016;
        plateGroup.add(centerSun);

        // VÒNG TAY BẠC CHẠM RỒNG ĐẶT TRÊN MÂM
        const bracelet = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 12, 32), silverMat);
        bracelet.rotation.x = Math.PI / 2;
        bracelet.position.set(-0.10, 0.04, 0.08);
        plateGroup.add(bracelet);

        // CƠI TRẦU BẠC KHẢM HÌNH QUẢ BÍ NGÔ CÓ NÚM SEN
        const betelBox = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), silverMat);
        betelBox.scale.set(1.0, 0.7, 1.0);
        betelBox.position.set(0.12, 0.05, -0.05);
        plateGroup.add(betelBox);

        const boxKnob = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.03, 8), materials.brassGold);
        boxKnob.position.set(0.12, 0.10, -0.05);
        plateGroup.add(boxKnob);

        g.add(plateGroup);
        break;
      }

      // -------------------------------------------------------------
      // 6. DỆT CHIẾU HỚI (chieu-cuon) — CHIẾU HOA CÓI TÂN LỄ & CON THOI GỖ
      // -------------------------------------------------------------
      case 'chieu-cuon': {
        const strawMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.85 });
        const redMat = materials.lacquerRed;
        const tealMat = new THREE.MeshStandardMaterial({ color: 0x1f7a8c, roughness: 0.85 });
        const shuttleWood = materials.ancientWood;

        // Tấm chiếu dệt trải phẳng trên mặt bệ
        const flatMat = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.02, 0.52), strawMat);
        flatMat.position.set(0, 0.01, 0);
        g.add(flatMat);

        // Hoa văn dệt hình quả trám & chữ Thọ màu đỏ + xanh chàm
        const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.022, 0.07), redMat);
        stripe1.position.set(0, 0.011, 0.12);
        g.add(stripe1);

        const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.022, 0.07), redMat);
        stripe2.position.set(0, 0.011, -0.12);
        g.add(stripe2);

        // Tâm chiếu hoa dệt chữ Thọ ngũ sắc
        const thoCenter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.024, 0.16), tealMat);
        thoCenter.position.set(0, 0.012, 0);
        g.add(thoCenter);

        // CUỘN CHIẾU CÓI HOA TRÒN ĐẶT PHÍA SAU
        const rollGroup = new THREE.Group();
        rollGroup.position.set(0, 0.12, -0.15);
        rollGroup.rotation.z = Math.PI / 2;

        const rollCore = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.65, 32), strawMat);
        rollGroup.add(rollCore);

        // Dải màu cuộn chiếu xen kẽ
        const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.10, 32), redMat);
        r1.position.y = 0.18;
        rollGroup.add(r1);

        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.10, 32), tealMat);
        r2.position.y = -0.18;
        rollGroup.add(r2);
        g.add(rollGroup);

        // BÓ CÓI KHÔ NHUỘM MÀU BUỘC LẠT
        const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 12), redMat);
        bundle.rotation.x = Math.PI / 2;
        bundle.rotation.z = -0.5;
        bundle.position.set(-0.25, 0.05, 0.12);
        g.add(bundle);

        // CON THOI DỆT CHIẾU GỖ BÓNG BẢY
        const shuttle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.28, 12), shuttleWood);
        shuttle.rotation.z = 1.1;
        shuttle.rotation.x = 0.2;
        shuttle.position.set(0.20, 0.04, 0.16);
        g.add(shuttle);
        break;
      }

      // -------------------------------------------------------------
      // 7. BÁNH CÁY LÀNG NGUYỄN (khay-banh) — THÁP NỔ NẾP VÀNG & CHÉN TRÀ XANH
      // -------------------------------------------------------------
      case 'khay-banh': {
        const lacquerTrayMat = new THREE.MeshStandardMaterial({ color: 0x220b08, roughness: 0.15, metalness: 0.3 });
        const cakeGoldMat = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.65 });
        const cakeOrangeMat = new THREE.MeshStandardMaterial({ color: 0xe05615, roughness: 0.65 });
        const cakeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfffaed, roughness: 0.6 });
        const gingerMat = new THREE.MeshStandardMaterial({ color: 0xffe8a3, roughness: 0.5 });
        const ceramicTeaMat = new THREE.MeshStandardMaterial({ color: 0x3d705b, roughness: 0.2, metalness: 0.1 });

        // Khay sơn mài khảm ốc xà cừ bát giác
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.38, 0.04, 8), lacquerTrayMat);
        tray.position.y = 0.02;
        g.add(tray);

        const trayRim = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.015, 8, 8), materials.brassGold);
        trayRim.rotation.x = Math.PI / 2;
        trayRim.position.y = 0.04;
        g.add(trayRim);

        // TẦNG 1: Khối bánh cáy vuông xếp đan xen nếp vàng, gấc đỏ và nếp nổ trắng
        const cubeSize = 0.075;
        const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const offsets1 = [-0.12, 0, 0.12];

        offsets1.forEach(cx => {
          offsets1.forEach(cz => {
            const pattern = (Math.abs(cx) + Math.abs(cz)) % 0.24;
            let mat = cakeGoldMat;
            if (pattern === 0) mat = cakeOrangeMat;
            else if (cx === 0 && cz === 0) mat = cakeWhiteMat;

            const piece = new THREE.Mesh(cubeGeo, mat);
            piece.position.set(cx - 0.04, 0.08, cz);
            g.add(piece);
          });
        });

        // TẦNG 2: Thu nhỏ kim tự tháp
        const offsets2 = [-0.06, 0.06];
        offsets2.forEach(cx => {
          offsets2.forEach(cz => {
            const piece = new THREE.Mesh(cubeGeo, (cx === cz) ? cakeOrangeMat : cakeGoldMat);
            piece.position.set(cx - 0.04, 0.155, cz);
            g.add(piece);
          });
        });

        // ĐỈNH BÁNH CÁY
        const topPiece = new THREE.Mesh(cubeGeo, cakeGoldMat);
        topPiece.position.set(-0.04, 0.23, 0);
        g.add(topPiece);

        // Rải sợi mứt gừng & vừng lạc vàng
        const sesameGeo = new THREE.SphereGeometry(0.018, 8, 8);
        const ses1 = new THREE.Mesh(sesameGeo, gingerMat);
        ses1.position.set(-0.04, 0.275, 0.01);
        g.add(ses1);

        // CHÉN TRÀ XANH THÁI BÌNH ĐẶT CẠNH KHAY BÁNH
        const teaCup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.065, 16), ceramicTeaMat);
        teaCup.position.set(0.24, 0.05, 0.14);
        g.add(teaCup);

        const teaWater = new THREE.Mesh(
          new THREE.CircleGeometry(0.065, 16),
          new THREE.MeshBasicMaterial({ color: 0x6e9934 })
        );
        teaWater.rotation.x = -Math.PI / 2;
        teaWater.position.set(0.24, 0.08, 0.14);
        g.add(teaWater);
        break;
      }

      // -------------------------------------------------------------
      // 8. CỒN VÀNH (dio-rama-bien) — TIỂU CẢNH RỪNG NGẬP MẶN & ĐÀN CÒ DI TRÚ
      // -------------------------------------------------------------
      case 'dio-rama-bien': {
        const frameMat = materials.ancientWood;
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x127475,
          roughness: 0.1,
          metalness: 0.25,
          transparent: true,
          opacity: 0.78
        });
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xd6b77e, roughness: 0.95 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x245e3f, roughness: 0.7 });
        const rootMat = new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.85 });
        const birdMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Khung gỗ bọc tiểu cảnh diorama
        const boxFrame = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.62), frameMat);
        boxFrame.position.y = 0.04;
        g.add(boxFrame);

        // Mặt nước biển cửa Ba Lạt sóng sánh
        const water = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.56), waterMat);
        water.position.y = 0.075;
        g.add(water);

        // Bãi bồi phù sa nhô lên
        const sandShoal = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          sandMat
        );
        sandShoal.scale.set(1.3, 0.45, 0.9);
        sandShoal.position.set(-0.12, 0.06, 0);
        g.add(sandShoal);

        // RỪNG SÚ VẸT NGẬP MẶN VỚI RỄ CỌC BẬC THẦY
        const trees = [
          { x: -0.18, z: -0.08, h: 0.26, r: 0.11 },
          { x: -0.06, z: 0.10,  h: 0.22, r: 0.09 },
          { x: -0.25, z: 0.08,  h: 0.19, r: 0.08 },
          { x: -0.10, z: -0.14, h: 0.17, r: 0.07 }
        ];

        trees.forEach(t => {
          // Rễ chùm chân kiềng uốn cong
          const root1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, t.h, 6), rootMat);
          root1.position.set(t.x, 0.08 + t.h / 2, t.z);
          g.add(root1);

          // Tán lá ngập mặn xanh xum xuê
          const canopy = new THREE.Mesh(new THREE.SphereGeometry(t.r, 12, 10), leafMat);
          canopy.scale.set(1.1, 0.8, 1.1);
          canopy.position.set(t.x, 0.08 + t.h, t.z);
          g.add(canopy);
        });

        // ĐÀN CÒ TRẮNG SẢI CÁNH BAY LƯỢN TRÊN MẶT NƯỚC
        const birds = [
          { x: 0.15, y: 0.38, z: -0.10, ry: 0.6 },
          { x: 0.24, y: 0.46, z: 0.02,  ry: 0.5 },
          { x: 0.08, y: 0.32, z: 0.14,  ry: 0.8 }
        ];

        birds.forEach(b => {
          const birdGroup = new THREE.Group();
          birdGroup.position.set(b.x, b.y, b.z);
          birdGroup.rotation.y = b.ry;

          // Thân chim
          const body = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), birdMat);
          body.rotation.x = Math.PI / 2;
          birdGroup.add(body);

          // Hai cánh sải chữ V
          const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.005, 0.03), birdMat);
          wingL.rotation.z = 0.35;
          wingL.position.set(-0.04, 0.015, 0);
          birdGroup.add(wingL);

          const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.005, 0.03), birdMat);
          wingR.rotation.z = -0.35;
          wingR.position.set(0.04, 0.015, 0);
          birdGroup.add(wingR);

          g.add(birdGroup);
        });

        // THUYỀN NAN ĐÁNH CÁ NAN TRE NEO ĐẬU
        const boatMat = materials.ancientWood;
        const boat = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.24, 8), boatMat);
        boat.scale.set(1.0, 0.4, 1.8);
        boat.rotation.x = Math.PI / 2;
        boat.rotation.y = 0.4;
        boat.position.set(0.18, 0.09, -0.06);
        g.add(boat);
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
  // 5. ĐIỀU HƯỚNG PHÒNG & CHUYỂN CẢNH CAMERA (STATE MACHINE) — SỬA LỖI 5
  // ==========================================================================
  function enterThaiBinhRoom() {
    if (APP_STATE.currentView === 'transition') return;
    APP_STATE.currentView = 'transition';

    buildThaiBinhRoom();
    scene.add(thaiBinhRoomGroup);

    const entranceTarget = new THREE.Vector3(0, 1.7, 8.5);
    const entranceLookAt = new THREE.Vector3(0, 1.5, 0);

    animateCamera({
      targetPos: entranceTarget,
      targetLookAt: entranceLookAt,
      duration: APP_STATE.reducedMotion ? 50 : 1600,
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

    if (lobbyGroup) {
      scene.add(lobbyGroup);
    }

    const lobbyTarget = new THREE.Vector3(0, 1.7, 3.5);
    const lobbyLookAt = new THREE.Vector3(0, 1.7, -2.0);

    animateCamera({
      targetPos: lobbyTarget,
      targetLookAt: lobbyLookAt,
      duration: APP_STATE.reducedMotion ? 50 : 1400,
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
      APP_STATE.selectedArtifactId = null;
      APP_STATE.currentView = 'thaibinh_room';
      cameraControl.isOrbiting = false;

      animateCamera({
        targetPos: new THREE.Vector3(0, 1.7, 8.5),
        targetLookAt: new THREE.Vector3(0, 1.5, 0),
        duration: 1000,
        onComplete: () => {
          updateUI();
        }
      });
    }
  }

  function focusArtifact(artifactId) {
    const artifact = ARTIFACTS.find(a => a.id === artifactId);
    if (!artifact) return;

    if (APP_STATE.currentView === 'lobby') {
      enterThaiBinhRoom();
      setTimeout(() => {
        focusArtifact(artifactId);
      }, APP_STATE.reducedMotion ? 100 : 1700);
      return;
    }

    APP_STATE.selectedArtifactId = artifactId;
    APP_STATE.currentView = 'artifact_focus';

    const { x, z } = artifact.toaDoKhongGian;
    const plinthCenter = new THREE.Vector3(x, 1.45, z);

    const standOffsetX = (x < 0) ? 1.6 : -1.6;
    const standOffsetZ = (z < 0) ? 1.4 : -1.4;

    const targetPos = new THREE.Vector3(x + standOffsetX, 1.6, z + standOffsetZ);

    cameraControl.orbitTarget.copy(plinthCenter);
    cameraControl.orbitRadius = targetPos.distanceTo(plinthCenter);
    cameraControl.yaw = Math.atan2(targetPos.x - plinthCenter.x, targetPos.z - plinthCenter.z);
    cameraControl.pitch = 0.15;
    cameraControl.isOrbiting = true;

    animateCamera({
      targetPos: targetPos,
      targetLookAt: plinthCenter,
      duration: APP_STATE.reducedMotion ? 50 : 1100,
      onComplete: () => {
        openDrawer(artifact);
        updateUI();
        showHintTemporarily('CẬN CẢNH', 'Kéo chuột để xoay ngắm chi tiết 3D hiện vật', 3000);
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
  function setupEventListeners() {
    window.addEventListener('resize', onWindowResize, false);

    // Kéo chuột & cảm ứng
    dom.container.addEventListener('mousedown', onPointerDown, false);
    window.addEventListener('mousemove', onPointerMove, false);
    window.addEventListener('mouseup', onPointerUp, false);

    dom.container.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, false);

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

    // Tự động làm mờ Hint khi người dùng bắt đầu thao tác
    scheduleHintFade(1500);
  }

  function onPointerMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (cameraControl.isDragging && !cameraTween.active) {
      const deltaX = e.clientX - cameraControl.prevMouseX;
      const deltaY = e.clientY - cameraControl.prevMouseY;
      cameraControl.prevMouseX = e.clientX;
      cameraControl.prevMouseY = e.clientY;

      const sensitivity = 0.004;

      if (cameraControl.isOrbiting) {
        cameraControl.yaw -= deltaX * sensitivity;
        cameraControl.pitch = Math.max(-0.2, Math.min(0.65, cameraControl.pitch + deltaY * sensitivity));

        const r = cameraControl.orbitRadius;
        const target = cameraControl.orbitTarget;
        camera.position.x = target.x + r * Math.sin(cameraControl.yaw) * Math.cos(cameraControl.pitch);
        camera.position.y = target.y + r * Math.sin(cameraControl.pitch) + 0.15;
        camera.position.z = target.z + r * Math.cos(cameraControl.yaw) * Math.cos(cameraControl.pitch);
        cameraTween.currentLookAt.copy(target);
        camera.lookAt(target);
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
      scheduleHintFade(1500);
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 1 && cameraControl.isDragging) {
      onPointerMove({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      });
    }
  }

  function onTouchEnd() {
    cameraControl.isDragging = false;
  }

  function onCanvasClick(e) {
    if (cameraTween.active) return;

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
      } else if (dom.drawer.classList.contains('open')) {
        viewRoomOverview();
      } else if (APP_STATE.currentRoomId === 'thaibinh') {
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
      dom.bottomDock.style.display = 'flex';
      if (dom.hintTag) dom.hintTag.innerText = 'HƯỚNG DẪN';
      if (dom.hintText) dom.hintText.innerText = 'Kéo chuột để quan sát • Click hiện vật để xem chi tiết • Esc để lùi';
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

    // 2. Tự động tính khoảng cách và làm mờ Biển tên 3D Billboard (Sửa lỗi 3)
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

    // 3. Render khung hình
    renderer.render(scene, camera);
  }

  window.addEventListener('DOMContentLoaded', init);

})();
