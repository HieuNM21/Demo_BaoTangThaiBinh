// script.js — Bảo tàng số Thái Bình
// Cấu trúc: sảnh (lobby) -> Gian Thái Bình (phòng riêng, cô lập hẳn khỏi sảnh)
// Mỗi hiện vật có hình khối riêng (hinhDang), bệ trưng bày, đèn rọi, và
// biển tên là vật thể 3D thật (Sprite) chứ không phải DOM overlay.

(function () {
  "use strict";

  // ===================== Thiết lập chung =====================
  const giamChuyenDong = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const canvas = document.getElementById("canvas-3d");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x100b07);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  const CHIEU_CAO_MAT = 1.7; // độ cao mắt người đứng

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ===================== Vật liệu dùng chung =====================
  const vlTuong = new THREE.MeshStandardMaterial({ color: 0x4a3527, roughness: 0.95 });
  const vlSan = new THREE.MeshStandardMaterial({ color: 0x2c2016, roughness: 0.85 });
  const vlTran = new THREE.MeshStandardMaterial({ color: 0x1c140d, roughness: 1 });
  const vlBe = new THREE.MeshStandardMaterial({ color: 0x2f241a, roughness: 0.8, metalness: 0.05 });
  const vlTuKinh = new THREE.MeshPhysicalMaterial({
    color: 0xbcd8e0,
    transparent: true,
    opacity: 0.12,
    roughness: 0.05,
    transmission: 0.9,
    metalness: 0,
  });

  // ===================== Ánh sáng tổng thể =====================
  // Bản three.js này dùng đơn vị ánh sáng vật lý (useLegacyLights=false, từ r155+),
  // nên cường độ đèn phải lớn hơn nhiều so với thang cũ để không bị tối đen.
  // Ambient/Hemisphere giảm bớt để tránh bệt một màu nâu phẳng; thêm đèn
  // định hướng nhẹ + đổ bóng để tường/sàn/trần có độ tương phản, nhìn ra khối.
  const anhSangMoi = new THREE.AmbientLight(0x4a3a28, 1.6);
  scene.add(anhSangMoi);
  const anhSangHatNhan = new THREE.HemisphereLight(0x574430, 0x0c0906, 0.8);
  scene.add(anhSangHatNhan);
  const anhSangDinhHuong = new THREE.DirectionalLight(0xffe6bd, 1.8);
  anhSangDinhHuong.position.set(4, 7, 5);
  anhSangDinhHuong.castShadow = true;
  anhSangDinhHuong.shadow.mapSize.set(1024, 1024);
  anhSangDinhHuong.shadow.camera.near = 0.5;
  anhSangDinhHuong.shadow.camera.far = 30;
  anhSangDinhHuong.shadow.camera.left = -12;
  anhSangDinhHuong.shadow.camera.right = 12;
  anhSangDinhHuong.shadow.camera.top = 12;
  anhSangDinhHuong.shadow.camera.bottom = -12;
  scene.add(anhSangDinhHuong);

  // ===================== Tiện ích dựng phòng =====================

  // Dựng 4 bức tường + sàn + trần cho một không gian hình chữ nhật.
  // rong: chiều rộng (x), sau: chiều sâu (z), cao: chiều cao tường.
  // moCuaBac / moCuaNam: độ rộng khoảng hở trên tường bắc/nam để làm cổng.
  function dungKhongGianHopChu(rong, sau, cao, tuyChon) {
    tuyChon = tuyChon || {};
    const nhom = new THREE.Group();
    const nuaRong = rong / 2;
    const nuaSau = sau / 2;

    const san = new THREE.Mesh(new THREE.PlaneGeometry(rong, sau), vlSan);
    san.rotation.x = -Math.PI / 2;
    san.receiveShadow = true;
    nhom.add(san);

    const tran = new THREE.Mesh(new THREE.PlaneGeometry(rong, sau), vlTran);
    tran.rotation.x = Math.PI / 2;
    tran.position.y = cao;
    nhom.add(tran);

    // Tường đông & tây (dọc theo trục z) — luôn kín
    const tuongDong = new THREE.Mesh(new THREE.PlaneGeometry(sau, cao), vlTuong);
    tuongDong.position.set(nuaRong, cao / 2, 0);
    tuongDong.rotation.y = -Math.PI / 2;
    tuongDong.receiveShadow = true;
    nhom.add(tuongDong);

    const tuongTay = new THREE.Mesh(new THREE.PlaneGeometry(sau, cao), vlTuong);
    tuongTay.position.set(-nuaRong, cao / 2, 0);
    tuongTay.rotation.y = Math.PI / 2;
    tuongTay.receiveShadow = true;
    nhom.add(tuongTay);

    // Tường bắc (z âm) & nam (z dương) — có thể có khoảng hở làm cổng
    function dungTuongNgang(zViTri, moCua, xoay) {
      if (!moCua) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(rong, cao), vlTuong);
        t.position.set(0, cao / 2, zViTri);
        t.rotation.y = xoay;
        t.receiveShadow = true;
        nhom.add(t);
        return;
      }
      // Hai mảng tường hai bên cổng
      const rongConLai = (rong - moCua) / 2;
      [-1, 1].forEach((phia) => {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(rongConLai, cao), vlTuong);
        t.position.set(phia * (moCua / 2 + rongConLai / 2), cao / 2, zViTri);
        t.rotation.y = xoay;
        t.receiveShadow = true;
        nhom.add(t);
      });
      // Dầm trên cổng (lanh tô)
      const dam = new THREE.Mesh(new THREE.BoxGeometry(moCua + 0.4, 0.6, 0.3), vlTuong);
      dam.position.set(0, cao - 0.3, zViTri);
      nhom.add(dam);
    }

    dungTuongNgang(-nuaSau, tuyChon.moCuaBac, 0);
    dungTuongNgang(nuaSau, tuyChon.moCuaNam, Math.PI);

    return nhom;
  }

  // Tạo texture canvas vẽ chữ — dùng cho biển tên 3D và biển khu vực.
  function taoTextureChu(dong1, dong2, tuyChon) {
    tuyChon = tuyChon || {};
    const rong = tuyChon.rong || 512;
    const cao = tuyChon.cao || 160;
    const cv = document.createElement("canvas");
    cv.width = rong;
    cv.height = cao;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, rong, cao);

    if (tuyChon.nenMo) {
      ctx.fillStyle = "rgba(15, 10, 6, 0.72)";
      roundRect(ctx, 4, 4, rong - 8, cao - 8, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(216,169,74,0.55)";
      ctx.lineWidth = 2;
      roundRect(ctx, 4, 4, rong - 8, cao - 8, 14);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = tuyChon.mauChu1 || "#f1e6d2";
    ctx.font = (tuyChon.coChu1 || 40) + "px Georgia, serif";
    ctx.fillText(dong1, rong / 2, dong2 ? cao * 0.4 : cao / 2);

    if (dong2) {
      ctx.fillStyle = tuyChon.mauChu2 || "#d8a94a";
      ctx.font = (tuyChon.coChu2 || 26) + "px 'Segoe UI', sans-serif";
      ctx.fillText(dong2, rong / 2, cao * 0.75);
    }

    const tex = new THREE.CanvasTexture(cv);
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Biển tên hiện vật: Sprite 3D thật trong không gian — tự bị che khuất
  // đúng theo độ sâu, không bao giờ đè lên nhau như DOM label chiếu 2D.
  function taoBienTenHienVat(ten) {
    const tex = taoTextureChu(ten, null, { rong: 400, cao: 110, nenMo: true, coChu1: 34 });
    const vl = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(vl);
    sprite.scale.set(1.45, 0.4, 1);
    return sprite;
  }

  function taoBienKhuVuc(ten) {
    const tex = taoTextureChu(ten, null, { rong: 560, cao: 130, nenMo: false, coChu1: 44, mauChu1: "#d8a94a" });
    const vl = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(vl);
    sprite.scale.set(2.6, 0.6, 1);
    return sprite;
  }

  // Bệ trưng bày hình trụ thấp + tuỳ chọn tủ kính hình trụ bao quanh
  function taoBeTrungBay(banKinh, coTuKinh) {
    const nhom = new THREE.Group();
    const be = new THREE.Mesh(new THREE.CylinderGeometry(banKinh, banKinh * 1.08, 1.1, 24), vlBe);
    be.position.y = 0.55;
    be.castShadow = true;
    be.receiveShadow = true;
    nhom.add(be);

    const vien = new THREE.Mesh(
      new THREE.CylinderGeometry(banKinh + 0.03, banKinh + 0.03, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0xd8a94a, metalness: 0.6, roughness: 0.35 })
    );
    vien.position.y = 1.1;
    nhom.add(vien);

    if (coTuKinh) {
      const tuKinh = new THREE.Mesh(new THREE.CylinderGeometry(banKinh + 0.35, banKinh + 0.35, 2, 24, 1, true), vlTuKinh);
      tuKinh.position.y = 1.1 + 1;
      nhom.add(tuKinh);
    }

    return nhom;
  }

  // ===================== Công thức khối cho từng hiện vật =====================
  // Mỗi hàm trả về { group, caoDat } — group đặt gốc tại (0,0,0) là mặt bệ.

  const CONG_THUC_KHOI = {
    // Gác chuông chùa Keo: tháp tầng mái — trụ mảnh xuyên 3 tầng mái xoè + mũi nhọn
    "thap-tang-mai": function (mau) {
      const g = new THREE.Group();
      const vlGo = new THREE.MeshStandardMaterial({ color: mau, roughness: 0.8 });
      const vlMai = new THREE.MeshStandardMaterial({ color: 0x2e2016, roughness: 0.7 });
      const than = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 8), vlGo);
      than.position.y = 0.95;
      g.add(than);
      const soTang = 3;
      for (let i = 0; i < soTang; i++) {
        const banKinhDuoi = 0.62 - i * 0.14;
        const banKinhTren = banKinhDuoi - 0.28;
        const mai = new THREE.Mesh(new THREE.CylinderGeometry(banKinhTren, banKinhDuoi, 0.14, 8), vlMai);
        mai.position.y = 0.35 + i * 0.55;
        mai.castShadow = true;
        g.add(mai);
        const san = new THREE.Mesh(new THREE.CylinderGeometry(banKinhTren * 0.85, banKinhTren * 0.85, 0.1, 8), vlGo);
        san.position.y = mai.position.y + 0.15;
        g.add(san);
      }
      const chop = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xd8a94a, metalness: 0.5, roughness: 0.3 }));
      chop.position.y = 1.95;
      g.add(chop);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { group: g, caoDat: 2.2 };
    },

    // Khu lăng mộ Tam Đường: nền chữ nhật + mô đất tròn + bia đá đứng
    "mo-dat-bia-da": function (mau) {
      const g = new THREE.Group();
      const vlNen = new THREE.MeshStandardMaterial({ color: 0x574a3a, roughness: 0.9 });
      const nen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.9), vlNen);
      nen.position.y = 0.07;
      g.add(nen);
      const vlDat = new THREE.MeshStandardMaterial({ color: mau, roughness: 1 });
      const moDat = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), vlDat);
      moDat.position.set(-0.15, 0.14, 0);
      moDat.scale.set(1, 0.75, 1);
      g.add(moDat);
      const bia = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.09), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 }));
      bia.position.set(0.42, 0.42 + 0.14, 0.1);
      bia.castShadow = true;
      g.add(bia);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { group: g, caoDat: 1.1 };
    },

    // Chiếu chèo làng Khuốc: mặt nạ chèo cách điệu dựng đứng trên giá
    "mat-na-cheo": function (mau) {
      const g = new THREE.Group();
      const vlMat = new THREE.MeshStandardMaterial({ color: mau, roughness: 0.55 });
      const mat = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 20), vlMat);
      mat.scale.set(1, 1.25, 0.35);
      mat.position.y = 0.95;
      mat.castShadow = true;
      g.add(mat);
      const vlMat2 = new THREE.MeshStandardMaterial({ color: 0x1a1512 });
      [-0.16, 0.16].forEach((dx) => {
        const mat3 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), vlMat2);
        mat3.position.set(dx, 1.05, 0.16);
        g.add(mat3);
      });
      const mieng = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a1f1f }));
      mieng.position.set(0, 0.82, 0.17);
      mieng.rotation.z = Math.PI;
      g.add(mieng);
      // Giá đỡ
      const gia = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x2f241a }));
      gia.position.y = 0.45;
      g.add(gia);
      return { group: g, caoDat: 1.4 };
    },

    // Trống hội: trụ to thấp, hai mặt trống khác màu, kèm 2 que trống dựa nghiêng
    "trong-hoi": function (mau) {
      const g = new THREE.Group();
      const vlThan = new THREE.MeshStandardMaterial({ color: mau, roughness: 0.7 });
      const than = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.62, 24, 1, true), vlThan);
      than.position.y = 0.5;
      than.castShadow = true;
      g.add(than);
      const vlMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 0.5 });
      const matTren = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 24), vlMat);
      matTren.position.y = 0.5 + 0.31;
      g.add(matTren);
      const matDuoi = matTren.clone();
      matDuoi.position.y = 0.5 - 0.31;
      g.add(matDuoi);
      // Đai trống
      for (let i = -1; i <= 1; i++) {
        const dai = new THREE.Mesh(new THREE.TorusGeometry(0.505, 0.02, 8, 24), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
        dai.rotation.x = Math.PI / 2;
        dai.position.y = 0.5 + i * 0.2;
        g.add(dai);
      }
      // Que trống dựa nghiêng
      const vlQue = new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
      [-0.7, 0.7].forEach((dx) => {
        const que = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), vlQue);
        que.position.set(dx, 0.38, 0.15);
        que.rotation.z = dx > 0 ? -0.35 : 0.35;
        g.add(que);
      });
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { group: g, caoDat: 1.2 };
    },

    // Chạm bạc Đồng Xâm: mâm bạc + vành nổi + trang sức nhỏ, chất kim loại sáng
    "mam-bac": function () {
      const g = new THREE.Group();
      const vlBac = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, metalness: 0.85, roughness: 0.25 });
      const mam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.08, 32), vlBac);
      mam.position.y = 0.55;
      mam.castShadow = true;
      g.add(mam);
      const vanh = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.045, 12, 32), vlBac);
      vanh.rotation.x = Math.PI / 2;
      vanh.position.y = 0.6;
      g.add(vanh);
      const trangSuc = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 10, 24), vlBac);
      trangSuc.position.set(0.1, 0.66, 0.05);
      trangSuc.rotation.x = Math.PI / 2;
      g.add(trangSuc);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return { group: g, caoDat: 0.72 };
    },

    // Dệt chiếu Hới: chiếu cuộn tròn nằm ngang, dải màu xen kẽ gợi hoa văn dệt cói
    "chieu-cuon": function (mau) {
      const g = new THREE.Group();
      const vlNen = new THREE.MeshStandardMaterial({ color: mau, roughness: 0.95 });
      const cuon = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.15, 20), vlNen);
      cuon.rotation.z = Math.PI / 2;
      cuon.position.y = 0.58;
      cuon.castShadow = true;
      g.add(cuon);
      const mauDai = [0x8a2f1f, 0xd8a94a, 0x3e5a45];
      for (let i = 0; i < 7; i++) {
        const dai = new THREE.Mesh(
          new THREE.CylinderGeometry(0.262, 0.262, 0.06, 20),
          new THREE.MeshStandardMaterial({ color: mauDai[i % mauDai.length], roughness: 0.9 })
        );
        dai.rotation.z = Math.PI / 2;
        dai.position.set(-0.5 + i * 0.16, 0.58, 0);
        g.add(dai);
      }
      // Mép chiếu hé mở
      const mep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.4), vlNen);
      mep.position.set(0.55, 0.58, 0);
      g.add(mep);
      return { group: g, caoDat: 0.9 };
    },

    // Bánh cáy làng Nguyễn: khay + cụm khối vuông nhỏ xếp tháp
    "khay-banh": function (mau) {
      const g = new THREE.Group();
      const vlKhay = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 });
      const khay = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.08, 20), vlKhay);
      khay.position.y = 0.55;
      khay.castShadow = true;
      g.add(khay);
      const vlBanh = new THREE.MeshStandardMaterial({ color: mau, roughness: 0.6 });
      const hang = [
        [0, 0, 0], [0.17, 0, 0], [-0.17, 0, 0], [0, 0, 0.17], [0, 0, -0.17],
      ];
      hang.forEach((p, i) => {
        const banh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.15), vlBanh);
        banh.position.set(p[0], 0.55 + 0.1, p[2]);
        banh.castShadow = true;
        g.add(banh);
      });
      const dinh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), vlBanh);
      dinh.position.set(0, 0.55 + 0.22, 0);
      g.add(dinh);
      return { group: g, caoDat: 0.95 };
    },

    // Cồn Vành: tiểu cảnh — mặt nước + cụm cây ngập mặn + chim cách điệu
    "dio-rama-bien": function () {
      const g = new THREE.Group();
      const khung = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.0), new THREE.MeshStandardMaterial({ color: 0x2f241a }));
      khung.position.y = 0.56;
      khung.castShadow = true;
      g.add(khung);
      const nuoc = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x2f6a72, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 })
      );
      nuoc.rotation.x = -Math.PI / 2;
      nuoc.position.y = 0.63;
      g.add(nuoc);
      const vlCay = new THREE.MeshStandardMaterial({ color: 0x3e7a5a, roughness: 0.9 });
      const viTriCay = [[-0.35, 0.1], [-0.2, 0.25], [-0.45, -0.15]];
      viTriCay.forEach((p, i) => {
        const cay = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 7), vlCay);
        cay.position.set(p[0], 0.63 + 0.16, p[1]);
        cay.rotation.y = i * 1.1;
        cay.castShadow = true;
        g.add(cay);
      });
      // Chim cách điệu: 2 tam giác dẹt ghép hình chữ V
      const vlChim = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, side: THREE.DoubleSide });
      const hinhTamGiac = new THREE.BufferGeometry();
      hinhTamGiac.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, 0, 0, 0.18, 0.06, 0, 0.02, -0.01, 0], 3)
      );
      hinhTamGiac.computeVertexNormals();
      const canhTrai = new THREE.Mesh(hinhTamGiac, vlChim);
      const canhPhai = canhTrai.clone();
      canhPhai.scale.x = -1;
      const chim = new THREE.Group();
      chim.add(canhTrai, canhPhai);
      chim.position.set(0.3, 0.95, -0.1);
      chim.rotation.x = -0.2;
      g.add(chim);
      return { group: g, caoDat: 1.05 };
    },
  };

  function dungHinhHienVat(artifact) {
    const hamDung = CONG_THUC_KHOI[artifact.hinhDang];
    if (!hamDung) {
      // Không dùng nhánh default chung — báo lỗi rõ để phát hiện thiếu công thức khối
      console.warn("Thiếu công thức khối cho hinhDang:", artifact.hinhDang);
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: artifact.mauSac || 0x888888 }));
      m.position.y = 0.75;
      g.add(m);
      return { group: g, caoDat: 1.1 };
    }
    return hamDung(artifact.mauSac);
  }

  // ===================== Sảnh (lobby) =====================
  const RONG_SANH = 10;
  const SAU_SANH = 9;
  const CAO_TUONG = 5;

  let lobbyGroup = null;
  const diemTuongTacSanh = [];

  function dungSanh() {
    const nhom = dungKhongGianHopChu(RONG_SANH, SAU_SANH, CAO_TUONG, { moCuaBac: RONG_SANH - 1 });
    nhom.name = "sanh";

    // Biển chào giữa sảnh
    const bienChao = taoTextureChu("Bảo tàng số Thái Bình", "Di sản văn hoá vùng đất Thái Bình", {
      rong: 700, cao: 200, nenMo: true, coChu1: 46, coChu2: 24,
    });
    const bienMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.9),
      new THREE.MeshBasicMaterial({ map: bienChao, transparent: true })
    );
    bienMesh.position.set(0, 3.1, -SAU_SANH / 2 + 0.02);
    nhom.add(bienMesh);

    // Đèn sảnh ấm dịu (cường độ lớn vì dùng đơn vị ánh sáng vật lý mới)
    const denSanh = new THREE.PointLight(0xffdca8, 80, 16, 1.6);
    denSanh.position.set(0, CAO_TUONG - 0.6, 0);
    nhom.add(denSanh);

    // Hai cổng vòm dẫn vào 2 gian — đặt ở tường bắc, trổ khoảng hở
    const viTriCongTB = new THREE.Vector3(-2.6, 0, -SAU_SANH / 2);
    const viTriCongHY = new THREE.Vector3(2.6, 0, -SAU_SANH / 2);

    const congThaiBinh = taoKhungCong(viTriCongTB, "Gian Thái Bình", "mo");
    nhom.add(congThaiBinh.group);
    diemTuongTacSanh.push({ mesh: congThaiBinh.hotspot, loai: "cong-thaibinh", nhan: "Vào Gian Thái Bình" });

    const congHungYen = taoKhungCong(viTriCongHY, "Gian Hưng Yên", "khoa");
    nhom.add(congHungYen.group);
    diemTuongTacSanh.push({ mesh: congHungYen.hotspot, loai: "cong-hungyen", nhan: "Gian Hưng Yên (sắp mở)" });

    // Thảm sàn nhẹ để định hướng lối đi
    const tham = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, SAU_SANH - 1.5),
      new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 1 })
    );
    tham.rotation.x = -Math.PI / 2;
    tham.position.y = 0.005;
    nhom.add(tham);

    return nhom;
  }

  function taoKhungCong(viTri, ten, trangThai) {
    const group = new THREE.Group();
    group.position.copy(viTri);

    const vlKhung = new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 0.8 });
    const rongCong = 2.1;
    const caoCong = 3.4;
    const trai = new THREE.Mesh(new THREE.BoxGeometry(0.25, caoCong, 0.35), vlKhung);
    trai.position.set(-rongCong / 2, caoCong / 2, 0);
    group.add(trai);
    const phai = trai.clone();
    phai.position.x = rongCong / 2;
    group.add(phai);
    const dinhCong = new THREE.Mesh(new THREE.CylinderGeometry(rongCong / 2 + 0.1, rongCong / 2 + 0.1, 0.35, 16, 1, false, 0, Math.PI), vlKhung);
    dinhCong.position.y = caoCong;
    dinhCong.rotation.z = Math.PI;
    dinhCong.rotation.x = Math.PI / 2;
    group.add(dinhCong);

    // Biển tên cổng
    const bien = taoTextureChu(ten, trangThai === "khoa" ? "Sắp mở" : "Nhấn để vào", {
      rong: 420, cao: 130, nenMo: true, coChu1: 32, coChu2: 22,
      mauChu2: trangThai === "khoa" ? "#8a8a8a" : "#d8a94a",
    });
    const bienMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshBasicMaterial({ map: bien, transparent: true }));
    bienMesh.position.set(0, caoCong + 0.55, 0);
    group.add(bienMesh);

    let hotspot;
    if (trangThai === "khoa") {
      // Cửa khoá chắn cổng + biểu tượng ổ khoá đơn giản
      const cua = new THREE.Mesh(
        new THREE.BoxGeometry(rongCong - 0.1, caoCong - 0.1, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x1a130d, roughness: 0.9 })
      );
      cua.position.y = (caoCong - 0.1) / 2;
      group.add(cua);
      const thanKhoa = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8a94a, metalness: 0.7, roughness: 0.3 }));
      thanKhoa.position.set(0, caoCong / 2 + 0.22, 0.06);
      group.add(thanKhoa);
      const hopKhoa = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2018, metalness: 0.4 }));
      hopKhoa.position.set(0, caoCong / 2, 0.07);
      group.add(hopKhoa);
      hotspot = cua;
    } else {
      hotspot = new THREE.Mesh(new THREE.PlaneGeometry(rongCong, caoCong), new THREE.MeshBasicMaterial({ visible: false }));
      hotspot.position.set(0, caoCong / 2, 0);
      group.add(hotspot);
    }
    hotspot.userData.congGroup = group;
    return { group, hotspot };
  }

  // ===================== Gian trưng bày (phòng theo gianId) =====================
  const RONG_PHONG = 14;
  const SAU_PHONG = 18;

  // Bố cục 4 khu vực: mỗi khu 2 hiện vật, cách nhau ~3.5 đơn vị theo z
  const BO_CUC_KHU_VUC = {
    "tin-nguong": { x: -5, z: 5.5, phiaTuong: -1 },
    "nghe-thuat": { x: 5, z: 5.5, phiaTuong: 1 },
    "lang-nghe": { x: -5, z: -4.5, phiaTuong: -1 },
    "am-thuc": { x: 5, z: -4.5, phiaTuong: 1 },
  };

  let phongHienTaiGroup = null;
  let danhSachHienVatPhong = []; // { data, group, viTriBe (Vector3), sprite, spotlight }
  let danhSachCongLoiRa = null;

  function xoaGroup(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => dispoMat(m));
        else dispoMat(o.material);
      }
      if (o.isSprite) {
        dispoMat(o.material);
      }
    });
  }
  function dispoMat(m) {
    if (m.map) m.map.dispose();
    m.dispose();
  }

  function dungPhongTrungBay(gianId) {
    const nhom = new THREE.Group();
    nhom.name = "gian-" + gianId;

    const khungPhong = dungKhongGianHopChu(RONG_PHONG, SAU_PHONG, CAO_TUONG, { moCuaNam: 3 });
    nhom.add(khungPhong);

    danhSachHienVatPhong = [];

    const hienVatTrongGian = ARTIFACTS.filter((a) => a.gian === gianId);

    NHOM.forEach((nhomChuDe) => {
      const bo = BO_CUC_KHU_VUC[nhomChuDe.ma];
      if (!bo) return;
      const hienVatKhu = hienVatTrongGian.filter((a) => a.nhom === nhomChuDe.ma);
      if (hienVatKhu.length === 0) return;

      // Biển tên khu vực gắn trên tường phía sau cụm
      const bienKhu = taoBienKhuVuc(nhomChuDe.ten);
      const xTuong = bo.phiaTuong < 0 ? -RONG_PHONG / 2 + 0.05 : RONG_PHONG / 2 - 0.05;
      bienKhu.position.set(xTuong, 3.3, bo.z);
      bienKhu.material.rotation = 0;
      nhom.add(bienKhu);
      // Xoay biển hướng vào giữa phòng (Sprite tự billboard nên chỉ cần đặt đúng vị trí)

      hienVatKhu.forEach((artifact, idx) => {
        const offsetZ = (idx - (hienVatKhu.length - 1) / 2) * 3.5;
        const viTriBe = new THREE.Vector3(bo.x, 0, bo.z + offsetZ);

        const be = taoBeTrungBay(0.75, true);
        be.position.copy(viTriBe);
        nhom.add(be);

        const { group: hinh, caoDat } = dungHinhHienVat(artifact);
        hinh.position.copy(viTriBe);
        hinh.position.y += 1.1; // đặt lên mặt bệ
        nhom.add(hinh);

        // Đèn rọi riêng cho từng bệ — hiệu ứng spotlight bảo tàng
        // (cường độ lớn vì renderer dùng đơn vị ánh sáng vật lý mới của three.js)
        const denRoi = new THREE.SpotLight(0xfff0d0, 140, 10, Math.PI / 7, 0.45, 1.2);
        denRoi.position.set(viTriBe.x, CAO_TUONG - 0.3, viTriBe.z);
        denRoi.target.position.set(viTriBe.x, 1.1, viTriBe.z);
        denRoi.castShadow = true;
        denRoi.shadow.mapSize.set(512, 512);
        nhom.add(denRoi);
        nhom.add(denRoi.target);

        // Biển tên hiện vật — Sprite 3D thật, đặt gần chân bệ
        const sprite = taoBienTenHienVat(artifact.ten);
        sprite.position.set(viTriBe.x, 1.65, viTriBe.z + 0.95);
        sprite.material.opacity = 0;
        nhom.add(sprite);

        // Hotspot để click/raycast — bọc quanh cả cụm bệ + hiện vật
        const hotspot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 0.9, 2.4, 12),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hotspot.position.set(viTriBe.x, 1.2, viTriBe.z);
        nhom.add(hotspot);

        danhSachHienVatPhong.push({
          data: artifact,
          viTriBe: viTriBe,
          sprite: sprite,
          hotspot: hotspot,
        });
      });
    });

    // Cổng lối ra — quay lại đúng cổng đã vào (tường nam)
    const congRa = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), new THREE.MeshBasicMaterial({ visible: false }));
    congRa.position.set(0, 1.7, SAU_PHONG / 2 - 0.1);
    nhom.add(congRa);
    danhSachCongLoiRa = congRa;

    return nhom;
  }

  // ===================== Trạng thái điều hướng / camera =====================
  let cheDo = "sanh"; // 'sanh' | 'gian' | 'xem-hien-vat'
  let gianHienTai = null;
  let hienVatDangXem = null;

  let yaw = 0;
  let pitch = 0;

  const bienDoi = new THREE.Object3D(); // vật thể tạm để tính yaw/pitch bằng lookAt
  function layYawPitchNhinVe(tuViTri, denMuc) {
    // Bản three.js r160 này khiến Object3D.lookAt() hướng trục +Z vào target,
    // trong khi hướng camera thực sự nhìn tới luôn là trục -Z cục bộ — ngược nhau.
    // Nếu tính yaw/pitch trực tiếp từ lookAt(denMuc) rồi gán cho camera, camera sẽ
    // quay lưng 180° vào đúng hướng cần nhìn (đây là nguyên nhân màn hình bị "nâu đặc":
    // camera nhìn thẳng vào bức tường ngay sau lưng thay vì vào giữa phòng).
    // Cách sửa: lookAt điểm ĐỐI XỨNG của denMuc qua tuViTri — khi đó trục -Z (hướng
    // camera thật) mới trỏ đúng về phía denMuc.
    const diemDoiXung = tuViTri.clone().multiplyScalar(2).sub(denMuc);
    bienDoi.position.copy(tuViTri);
    bienDoi.lookAt(diemDoiXung);
    const euler = new THREE.Euler().setFromQuaternion(bienDoi.quaternion, "YXZ");
    return { yaw: euler.y, pitch: euler.x };
  }

  function apDungGoc() {
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  }

  // Giới hạn góc nhìn dọc — không thấy xuyên trần/sàn
  const GIOI_HAN_PITCH = 0.5;

  // Hoạt ảnh camera (dolly qua cổng, tiến lại gần hiện vật...)
  let hoatAnh = null;
  function chayHoatAnhCamera(denViTri, denMuc, thoiLuong, khiXong) {
    const { yaw: yawDich, pitch: pitchDich } = layYawPitchNhinVe(denViTri, denMuc);
    if (giamChuyenDong || thoiLuong <= 0) {
      camera.position.copy(denViTri);
      yaw = yawDich;
      pitch = pitchDich;
      apDungGoc();
      if (khiXong) khiXong();
      return;
    }
    hoatAnh = {
      viTriDau: camera.position.clone(),
      viTriCuoi: denViTri.clone(),
      yawDau: yaw,
      yawCuoi: goNguyenGocGanNhat(yaw, yawDich),
      pitchDau: pitch,
      pitchCuoi: pitchDich,
      batDau: performance.now(),
      thoiLuong: thoiLuong,
      khiXong: khiXong,
    };
  }

  function goNguyenGocGanNhat(goc, gocDich) {
    let hieu = gocDich - goc;
    while (hieu > Math.PI) hieu -= Math.PI * 2;
    while (hieu < -Math.PI) hieu += Math.PI * 2;
    return goc + hieu;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function capNhatHoatAnh(now) {
    if (!hoatAnh) return;
    const t = Math.min(1, (now - hoatAnh.batDau) / hoatAnh.thoiLuong);
    const e = easeInOutCubic(t);
    camera.position.lerpVectors(hoatAnh.viTriDau, hoatAnh.viTriCuoi, e);
    yaw = hoatAnh.yawDau + (hoatAnh.yawCuoi - hoatAnh.yawDau) * e;
    pitch = hoatAnh.pitchDau + (hoatAnh.pitchCuoi - hoatAnh.pitchDau) * e;
    apDungGoc();
    if (t >= 1) {
      const xong = hoatAnh.khiXong;
      hoatAnh = null;
      if (xong) xong();
    }
  }

  // ===================== Chuyển cảnh giữa sảnh / gian / xem hiện vật =====================
  function vaoSanh(tucThi) {
    cheDo = "sanh";
    gianHienTai = null;
    hienVatDangXem = null;
    dongPanelChiTiet();
    xoaVongTronFocus();
    if (phongHienTaiGroup) {
      scene.remove(phongHienTaiGroup);
      xoaGroup(phongHienTaiGroup);
      phongHienTaiGroup = null;
    }
    if (!lobbyGroup) lobbyGroup = dungSanh();
    if (!scene.children.includes(lobbyGroup)) scene.add(lobbyGroup);
    capNhatThanhTieuDe("Tiền sảnh", false);
    focusIndex = -1;
    const viTriBatDau = new THREE.Vector3(0, CHIEU_CAO_MAT, 3);
    const nhinVe = new THREE.Vector3(0, CHIEU_CAO_MAT, -SAU_SANH / 2);
    chayHoatAnhCamera(viTriBatDau, nhinVe, tucThi ? 0 : 900);
  }

  function vaoGian(gianId) {
    // Cô lập hoàn toàn: chỉ phòng đang active được add vào scene.
    if (lobbyGroup) scene.remove(lobbyGroup);
    phongHienTaiGroup = dungPhongTrungBay(gianId);
    scene.add(phongHienTaiGroup);
    cheDo = "gian";
    gianHienTai = gianId;
    hienVatDangXem = null;
    xoaVongTronFocus();
    const tenGian = (GIAN.find((g) => g.ma === gianId) || {}).ten || "";
    capNhatThanhTieuDe(tenGian, true);
    focusIndex = -1;

    const viTriVao = new THREE.Vector3(0, CHIEU_CAO_MAT, SAU_PHONG / 2 - 2.2);
    const nhinVeTrongPhong = new THREE.Vector3(0, CHIEU_CAO_MAT, 0);
    chayHoatAnhCamera(viTriVao, nhinVeTrongPhong, 1200);
  }

  function veLaiTongQuanPhong() {
    hienVatDangXem = null;
    cheDo = "gian";
    const tenGian = (GIAN.find((g) => g.ma === gianHienTai) || {}).ten || "";
    capNhatThanhTieuDe(tenGian, true);
    dongPanelChiTiet();
    xoaVongTronFocus();
    const viTriVao = new THREE.Vector3(0, CHIEU_CAO_MAT, SAU_PHONG / 2 - 2.2);
    const nhinVeTrongPhong = new THREE.Vector3(0, CHIEU_CAO_MAT, 0);
    chayHoatAnhCamera(viTriVao, nhinVeTrongPhong, 800);
  }

  function tienLaiGanHienVat(muc) {
    hienVatDangXem = muc;
    cheDo = "xem-hien-vat";
    const be = muc.viTriBe;
    // Hướng từ tường vào giữa phòng để đứng đối diện hiện vật
    const huongVaoTrong = be.x < 0 ? 1 : -1;
    const viTriDung = new THREE.Vector3(be.x + huongVaoTrong * 2.3, CHIEU_CAO_MAT, be.z);
    const nhinVao = new THREE.Vector3(be.x, 1.3, be.z);
    chayHoatAnhCamera(viTriDung, nhinVao, 900, () => {
      moPanelChiTiet(muc.data);
    });
    capNhatThanhTieuDe(muc.data.ten, true);
  }

  // ===================== Giao diện: thanh tiêu đề, panel, thông báo =====================
  const elTenKhuVuc = document.getElementById("ten-khu-vuc-hien-tai");
  const elNutVeSanh = document.getElementById("nut-ve-sanh");
  const elGoiY = document.getElementById("goi-y-dieu-khien");
  const elPanel = document.getElementById("panel-chi-tiet");

  function capNhatThanhTieuDe(ten, hienNutVe) {
    elTenKhuVuc.textContent = ten;
    elNutVeSanh.hidden = !hienNutVe;
  }

  function hienThongBao(text, thoiGian) {
    const cu = elGoiY.textContent;
    elGoiY.textContent = text;
    elGoiY.style.opacity = "1";
    clearTimeout(hienThongBao._t);
    hienThongBao._t = setTimeout(() => {
      elGoiY.textContent = cu;
    }, thoiGian || 2200);
  }

  function moPanelChiTiet(artifact) {
    document.getElementById("panel-nhom").textContent =
      (NHOM.find((n) => n.ma === artifact.nhom) || {}).ten || "";
    document.getElementById("panel-ten").textContent = artifact.ten;
    document.getElementById("panel-mo-ta-ngan").textContent = artifact.moTaNgan;
    document.getElementById("panel-cau-chuyen").textContent = artifact.cauChuyen;
    document.getElementById("panel-ban-co-biet").textContent = artifact.banCoBiet;
    elPanel.hidden = false;
  }
  function dongPanelChiTiet() {
    elPanel.hidden = true;
  }

  document.getElementById("nut-dong-panel").addEventListener("click", () => veLaiTongQuanPhong());
  document.getElementById("nut-lui-ra").addEventListener("click", () => veLaiTongQuanPhong());
  elNutVeSanh.addEventListener("click", () => vaoSanh(false));

  // ===================== Tương tác chuột: xoay nhìn + click chọn =====================
  let dangKeo = false;
  let veTriChuotTruoc = { x: 0, y: 0 };
  let veTriChuotXuong = { x: 0, y: 0 };
  const NHAY_CHUOT = 0.0028;

  canvas.addEventListener("pointerdown", (e) => {
    dangKeo = true;
    veTriChuotTruoc = { x: e.clientX, y: e.clientY };
    veTriChuotXuong = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointermove", (e) => {
    if (!dangKeo) return;
    const dx = e.clientX - veTriChuotTruoc.x;
    const dy = e.clientY - veTriChuotTruoc.y;
    veTriChuotTruoc = { x: e.clientX, y: e.clientY };
    if (hoatAnh) return;
    yaw -= dx * NHAY_CHUOT;
    pitch -= dy * NHAY_CHUOT;
    pitch = Math.max(-GIOI_HAN_PITCH, Math.min(GIOI_HAN_PITCH, pitch));
    apDungGoc();
  });
  window.addEventListener("pointerup", (e) => {
    dangKeo = false;
    const dx = e.clientX - veTriChuotXuong.x;
    const dy = e.clientY - veTriChuotXuong.y;
    if (Math.hypot(dx, dy) < 6) {
      xuLyClick(e.clientX, e.clientY);
    }
  });

  const raycaster = new THREE.Raycaster();
  function xuLyClick(x, y) {
    if (hoatAnh) return;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    if (cheDo === "sanh") {
      const meshes = diemTuongTacSanh.map((d) => d.mesh);
      const giao = raycaster.intersectObjects(meshes, false);
      if (giao.length > 0) {
        const diem = diemTuongTacSanh.find((d) => d.mesh === giao[0].object);
        xuLyChonDiemSanh(diem);
      }
    } else if (cheDo === "gian") {
      const meshes = danhSachHienVatPhong.map((m) => m.hotspot);
      const giao = raycaster.intersectObjects(meshes, false);
      if (giao.length > 0) {
        const muc = danhSachHienVatPhong.find((m) => m.hotspot === giao[0].object);
        tienLaiGanHienVat(muc);
      }
    }
  }

  function xuLyChonDiemSanh(diem) {
    if (!diem) return;
    if (diem.loai === "cong-thaibinh") {
      vaoGian("thaibinh");
    } else if (diem.loai === "cong-hungyen") {
      hienThongBao("Gian Hưng Yên đang được chuẩn bị — sắp mở!", 2400);
    }
  }

  // ===================== Điều hướng bàn phím: Tab / Enter / Esc =====================
  let focusIndex = -1;
  let vongTronFocus = null;

  function danhSachTuongTacHienTai() {
    if (cheDo === "sanh") return diemTuongTacSanh;
    if (cheDo === "gian") return danhSachHienVatPhong;
    return [];
  }

  canvas.setAttribute("tabindex", "0");
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ds = danhSachTuongTacHienTai();
      if (ds.length === 0) return;
      focusIndex = (focusIndex + (e.shiftKey ? -1 : 1) + ds.length) % ds.length;
      hienThiFocus(ds[focusIndex]);
    } else if (e.key === "Enter") {
      const ds = danhSachTuongTacHienTai();
      if (focusIndex >= 0 && ds[focusIndex]) {
        if (cheDo === "sanh") xuLyChonDiemSanh(ds[focusIndex]);
        else if (cheDo === "gian") tienLaiGanHienVat(ds[focusIndex]);
      }
    } else if (e.key === "Escape") {
      if (cheDo === "xem-hien-vat") veLaiTongQuanPhong();
      else if (cheDo === "gian") vaoSanh(false);
    }
  });

  function xoaVongTronFocus() {
    focusIndex = -1;
    if (vongTronFocus && vongTronFocus.parent) vongTronFocus.parent.remove(vongTronFocus);
  }

  function hienThiFocus(muc) {
    if (!vongTronFocus) {
      vongTronFocus = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 0.95, 32),
        new THREE.MeshBasicMaterial({ color: 0xd8a94a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      vongTronFocus.rotation.x = -Math.PI / 2;
    }
    const activeGroup = cheDo === "sanh" ? lobbyGroup : phongHienTaiGroup;
    if (!activeGroup) return;
    if (!activeGroup.children.includes(vongTronFocus)) activeGroup.add(vongTronFocus);
    const pos = cheDo === "sanh" ? muc.mesh.getWorldPosition(new THREE.Vector3()) : muc.viTriBe;
    vongTronFocus.position.set(pos.x, 0.02, pos.z);
  }

  // ===================== Cập nhật biển tên theo khoảng cách camera =====================
  function capNhatBienTen() {
    if (cheDo === "sanh" || danhSachHienVatPhong.length === 0) return;
    danhSachHienVatPhong.forEach((muc) => {
      const kc = camera.position.distanceTo(muc.viTriBe);
      let doMo;
      if (hienVatDangXem === muc) doMo = 1;
      else if (kc < 4) doMo = 1;
      else if (kc < 8) doMo = 1 - (kc - 4) / 4;
      else doMo = 0;
      muc.sprite.material.opacity = THREE.MathUtils.lerp(muc.sprite.material.opacity, doMo, 0.15);
    });
  }

  // ===================== Vòng lặp render =====================
  function veKhung(now) {
    requestAnimationFrame(veKhung);
    capNhatHoatAnh(now);
    capNhatBienTen();
    renderer.render(scene, camera);
  }

  // ===================== Khởi động =====================
  const elManHinhChao = document.getElementById("man-hinh-chao");
  const elNutBatDau = document.getElementById("nut-bat-dau");

  function batDau() {
    elManHinhChao.classList.add("an");
    canvas.focus();
    vaoSanh(true);
    requestAnimationFrame(veKhung);
  }

  elNutBatDau.addEventListener("click", batDau);

  // Đặt tư thế camera ban đầu trước khi bắt đầu (đứng giữa sảnh)
  camera.position.set(0, CHIEU_CAO_MAT, 3);
  yaw = 0;
  pitch = 0;
  apDungGoc();
})();
