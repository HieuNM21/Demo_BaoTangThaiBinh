/* Bảo tàng số: data.js chứa nội dung, file này chỉ đọc dữ liệu và dựng giao diện. */
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let currentRoom = null, selected = null, drag = null;

const iconFor = group => ({ 'tin-nguong': '⌂', 'nghe-thuat': '♫', 'lang-nghe': '✦', 'am-thuc': '❋' })[group] || '✦';
const artifact3D = (item, large = false) => `<div class="object ${large ? 'object--large' : ''}" style="--artifact:${item.mauSac}">
  <div class="object-spin"><div class="object-shape">${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.ten}">` : `<span aria-hidden="true">${iconFor(item.nhom)}</span>`}</div></div></div>`;

function showToast(message) {
  toast.textContent = message; toast.classList.add('toast--show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('toast--show'), 2800);
}

// Dựng sảnh từ GIAN, do đó chỉ đổi dữ liệu khi bổ sung gian mới.
function renderLobby() {
  currentRoom = null; selected = null;
  app.innerHTML = `<section class="lobby"><div class="intro"><p class="project">Dự án Khoa học Kỹ thuật</p><h1>Bảo tàng số<br><em>đồng bằng</em></h1><p>Chạm vào những lớp ký ức của Thái Bình, nơi di sản vẫn ngân lên trong nhịp sống hôm nay.</p></div>
    <div class="gates">${GIAN.map(room => `<button class="gate ${room.trangThai === 'khoa' ? 'gate--locked' : ''}" data-room="${room.ma}" ${room.trangThai === 'khoa' ? 'aria-describedby="locked-note"' : ''}><span class="gate__arch">${room.trangThai === 'khoa' ? '⌁' : '✦'}</span><strong>${room.ten}</strong><small>${room.trangThai === 'khoa' ? 'Đang chuẩn bị' : 'Bước vào trưng bày'}</small></button>`).join('')}</div><p id="locked-note" class="source-note">Nội dung demo cần được đối chiếu, trích dẫn nguồn trước khi dự thi.</p></section>`;
  app.querySelectorAll('[data-room]').forEach(button => button.addEventListener('click', () => {
    const room = GIAN.find(r => r.ma === button.dataset.room);
    room.trangThai === 'mo' ? renderRoom(room.ma) : showToast('Gian trưng bày đang được chuẩn bị, quay lại sau nhé.');
  }));
}

function renderRoom(roomId) {
  currentRoom = roomId;
  const room = GIAN.find(r => r.ma === roomId);
  const sections = NHOM.map(group => {
    const items = ARTIFACTS.filter(item => item.gian === roomId && item.nhom === group.ma);
    if (!items.length) return '';
    return `<section class="collection"><h2>${group.ten}</h2><div class="pedestal-grid">${items.map(item => `<button class="pedestal ${item.trangThai === 'khoa' ? 'is-locked' : ''}" data-artifact="${item.id}" ${item.trangThai === 'khoa' ? 'disabled' : ''} aria-label="Xem ${item.ten}"><span class="pedestal__scene">${artifact3D(item)}</span><span class="pedestal__base"></span><strong>${item.ten}</strong></button>`).join('')}</div></section>`;
  }).join('');
  app.innerHTML = `<section class="gallery"><header class="gallery__header"><button class="back" id="back-lobby">← Quay lại sảnh</button><div><p class="project">Bộ sưu tập</p><h1>${room.ten}</h1></div><p class="count">${ARTIFACTS.filter(a => a.gian === roomId).length} hiện vật</p></header>${sections}</section>`;
  document.querySelector('#back-lobby').addEventListener('click', renderLobby);
  app.querySelectorAll('[data-artifact]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.artifact)));
}

function openDetail(id) {
  selected = ARTIFACTS.find(item => item.id === id);
  let rx = -8, ry = -18;
  app.insertAdjacentHTML('beforeend', `<section class="detail" role="dialog" aria-modal="true" aria-label="${selected.ten}"><button class="close" aria-label="Đóng chi tiết">×</button><div class="detail__viewer" id="viewer">${artifact3D(selected, true)}</div><article class="detail__info"><p class="project">${NHOM.find(g => g.ma === selected.nhom).ten}</p><h2>${selected.ten}</h2><p class="lead">${selected.moTaNgan}</p><details open><summary>Câu chuyện hiện vật</summary><p>${selected.cauChuyen}</p></details><aside><span>Bạn có biết?</span><p>${selected.banCoBiet}</p></aside></article></section>`);
  const detail = app.querySelector('.detail'), viewer = document.querySelector('#viewer'), object = viewer.querySelector('.object');
  const setRotation = () => object.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  setRotation();
  const finish = () => { detail.remove(); selected = null; };
  detail.querySelector('.close').addEventListener('click', finish); detail.querySelector('.close').focus();
  // Kéo chuột hoặc chạm để xoay hiện vật; góc X giới hạn để luôn dễ nhìn.
  viewer.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; viewer.setPointerCapture(e.pointerId); });
  viewer.addEventListener('pointermove', e => { if (!drag) return; ry += (e.clientX - drag.x) * .55; rx = Math.max(-55, Math.min(45, rx - (e.clientY - drag.y) * .35)); drag = { x: e.clientX, y: e.clientY }; setRotation(); });
  viewer.addEventListener('pointerup', () => drag = null); viewer.addEventListener('pointercancel', () => drag = null);
}

document.addEventListener('keydown', event => { if (event.key === 'Escape' && selected) document.querySelector('.detail .close')?.click(); });
renderLobby();
