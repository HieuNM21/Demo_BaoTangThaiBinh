/**
 * BẢO TÀNG SỐ DI SẢN THÁI BÌNH & HƯNG YÊN
 * Dữ liệu hiện vật, nhóm chủ đề và gian trưng bày
 */

const NHOM = [
  { ma: "tin-nguong", ten: "Tín ngưỡng & kiến trúc", icon: "🏛️", moTa: "Các công trình tâm linh và lăng mộ cổ kính ngàn năm" },
  { ma: "nghe-thuat", ten: "Nghệ thuật dân gian",     icon: "🎭", moTa: "Làn điệu chèo, hội hè và âm nhạc truyền thống" },
  { ma: "lang-nghe",  ten: "Làng nghề truyền thống",   icon: "🪵", moTa: "Kỹ nghệ thủ công tinh hoa lưu truyền nhiều thế kỷ" },
  { ma: "am-thuc",    ten: "Ẩm thực & thiên nhiên",   icon: "🌾", moTa: "Sản vật tinh túy và cảnh quan châu thổ sông Hồng" }
];

const GIAN = [
  {
    ma: "thaibinh",
    ten: "Gian Thái Bình",
    tieuDePhu: "Đất cổ châu thổ — Quê lúa & Cái nôi Chèo",
    trangThai: "mo",
    moTa: "Không gian trưng bày 8 di sản tiêu biểu của vùng đất Thái Bình, từ kiến trúc gác chuông chùa Keo đến làng nghề chạm bạc Đồng Xâm."
  },
  {
    ma: "hungyen",
    ten: "Gian Hưng Yên",
    tieuDePhu: "Thứ nhất Kinh Kỳ, thứ nhì Phố Hiến",
    trangThai: "khoa",
    moTa: "Khu trưng bày đang trong giai đoạn phục dựng 3D — sẽ mở cửa giới thiệu Văn Miếu Xích Đằng, đền Chử Đồng Tử, làng nhãn lồng..."
  }
];

const ARTIFACTS = [
  // ==========================================
  // GIAN THÁI BÌNH (8 HIỆN VẬT - DỰNG 3D ĐẦY ĐỦ)
  // ==========================================
  {
    id: "chua-keo",
    gian: "thaibinh",
    nhom: "tin-nguong",
    ten: "Gác chuông chùa Keo",
    moTaNgan: "Một trong những công trình gỗ cổ được gìn giữ nguyên vẹn nhất Việt Nam.",
    cauChuyen: "Gác chuông chùa Keo cao gần 11 mét, dựng từ thế kỷ 17 (thời Lê Trung Hưng), đứng vững qua hàng trăm mùa mưa bão nhờ kỹ thuật mộng gỗ truyền thống không cần dùng một chiếc đinh sắt nào. Toàn bộ khối kiến trúc thanh thoát vút lên trời xanh, vừa uy nghiêm vừa hòa hợp với cảnh sắc đồng bằng.",
    banCoBiet: "Gác chuông có 3 tầng mái với 84 cửa dàn quạt tinh xảo, treo quả chuông đồng đúc năm 1686 nặng hơn một tấn.",
    mauSac: "#8C4A2F",
    hinhDang: "thap-tang-mai",
    trangThai: "mo",
    toaDoKhongGian: { x: -4.8, z: -7.5 }
  },
  {
    id: "tam-duong",
    gian: "thaibinh",
    nhom: "tin-nguong",
    ten: "Khu lăng mộ Tam Đường",
    moTaNgan: "Nơi phát tích thiêng liêng của vương triều Trần rực rỡ võ công văn trị.",
    cauChuyen: "Tam Đường (xã Tiến Đức, huyện Hưng Hà) là nơi an táng các vị tiên tổ nhà Trần (Thái Tổ Trần Thừa, Thái Tông, Thánh Tông, Nhân Tông). Từ bãi triều sông Luộc này, hào khí Đông A đã khởi nguồn, làm nên ba lần chiến thắng giặc Nguyên Mông hiển hách trong sử sách.",
    banCoBiet: "Khu di tích gồm các gò mộ ngút ngàn cây xanh và các tấm bia đá cổ kính lưu dấu tích của một hoàng tộc xuất thân từ nghề chài lưới.",
    mauSac: "#5A6552",
    hinhDang: "mo-dat-bia-da",
    trangThai: "mo",
    toaDoKhongGian: { x: -2.8, z: -4.5 }
  },
  {
    id: "cheo-khuoc",
    gian: "thaibinh",
    nhom: "nghe-thuat",
    ten: "Chiếu chèo làng Khuốc",
    moTaNgan: "Một trong những cái nôi cổ xưa và chuẩn mực nhất của nghệ thuật chèo Việt Nam.",
    cauChuyen: "Người làng Khuốc (xã Phong Châu, Đông Hưng) từ xưa đã có câu: 'Hát chèo từ thủa trong nôi'. Từ người nông dân chân lấm tay bùn bước lên chiếu chèo đình làng, họ giữ trọn vẹn từng làn điệu cổ tích, điệu hề gậy, hề mồi mộc mạc mà thâm thúy sâu cay.",
    banCoBiet: "Làng Khuốc lưu giữ được gần trọn vẹn cả 5 vở chèo cổ kinh điển: Quan Âm Thị Kính, Lưu Bình Dương Lễ, Kim Nham, Trương Viên và Chu Mãi Thần.",
    mauSac: "#B85D43",
    hinhDang: "mat-na-cheo",
    trangThai: "mo",
    toaDoKhongGian: { x: -4.8, z: 2.0 }
  },
  {
    id: "hoi-chua-keo",
    gian: "thaibinh",
    nhom: "nghe-thuat",
    ten: "Trống hội & rước kiệu chùa Keo",
    moTaNgan: "Âm vang lễ hội cổ truyền đặc sắc nhất miền hạ lưu châu thổ sông Hồng.",
    cauChuyen: "Mỗi độ thu về vào tháng Chín âm lịch, tiếng trống hội chùa Keo rền vang khắp vùng sông Trà Lý. Đám rước kiệu Thánh quy mô lộng lẫy, kết hợp các cuộc thi bơi trải trên sông và múa ếch vồ, tái hiện huyền tích Không Lộ Thiền sư hộ quốc an dân.",
    banCoBiet: "Dàn trống hội chùa Keo gồm trống cái trầm hùng và trống cơm rộn rã, được gõ theo nhịp phách cung đình đan xen âm hưởng dân gian.",
    mauSac: "#9E2A2B",
    hinhDang: "trong-hoi",
    trangThai: "mo",
    toaDoKhongGian: { x: -2.8, z: 5.0 }
  },
  {
    id: "dong-xam",
    gian: "thaibinh",
    nhom: "lang-nghe",
    ten: "Chạm bạc Đồng Xâm",
    moTaNgan: "Làng nghề kim hoàn chạm bạc thủ công tinh xảo lừng danh hơn 600 năm tuổi.",
    cauChuyen: "Nghề chạm bạc Đồng Xâm (xã Hồng Thái, Kiến Xương) bắt đầu từ thế kỷ 15 do cụ Nguyễn Kim Xuyên truyền dạy. Khác với bạc chạm nơi khác, sản phẩm Đồng Xâm nổi bật với nét chạm trổ hoa văn 'ám', lộng nổi khối kỳ ảo trên mâm đồng, ấm bạc, đồ trang sức tiến vua chúa.",
    banCoBiet: "Nghệ nhân Đồng Xâm có bí quyết chạm tay không cần dùng khuôn đúc lặp lại, mỗi sản phẩm là một tác phẩm độc bản của tài hoa đường nét.",
    mauSac: "#D3D7DC",
    hinhDang: "mam-bac",
    trangThai: "mo",
    toaDoKhongGian: { x: 2.8, z: -4.5 }
  },
  {
    id: "chieu-hoi",
    gian: "thaibinh",
    nhom: "lang-nghe",
    ten: "Dệt chiếu Hới",
    moTaNgan: "Nghề dệt chiếu cói truyền thống Tân Lễ nức tiếng 'Ăn cơm trừng trộm, trải chiếu Hới'.",
    cauChuyen: "Làng Hới (Hải Triều, Hưng Hà) trồng cói bên bãi bồi ven sông Hồng và sông Luộc. Cây cói được phơi trắng, nhuộm màu tươi sáng rồi dệt trên khung gỗ kẽo kẹt đêm ngày. Chiếu Hới bền dẻo, nằm mùa hè mát rượi, mùa đông ấm áp thơm ngát mùi hương cói mới.",
    banCoBiet: "Trạng nguyên Phạm Đôn Lễ sau khi đi sứ nhà Minh đã mang bí quyết dệt chiếu tiên tiến về truyền cho quê hương, được dân làng tôn làm Thành hoàng làng nghề.",
    mauSac: "#D4A373",
    hinhDang: "chieu-cuon",
    trangThai: "mo",
    toaDoKhongGian: { x: 4.8, z: -7.5 }
  },
  {
    id: "banh-cay",
    gian: "thaibinh",
    nhom: "am-thuc",
    ten: "Bánh cáy làng Nguyễn",
    moTaNgan: "Thức quà thơm thảo hương đồng gió nội từng được dâng tiến vua ngự lãm.",
    cauChuyen: "Bánh cáy làng Nguyễn (xã Nguyên Xá, Đông Hưng) do bà Nguyễn Thị Tần (nữ quan đời vua Lê Hiển Tông) sáng tạo. Bánh làm từ nếp cái hoa vàng, mứt gấc, quả dành dành tạo sắc đỏ vàng như trứng con cáy, hòa cùng vị cay nồng của gừng tươi và bùi béo của vừng lạc.",
    banCoBiet: "Tên gọi bánh cáy xuất phát từ màu sắc lốm đốm vàng cam giống trứng con cáy biển, không phải làm từ thịt con cáy.",
    mauSac: "#E9C46A",
    hinhDang: "khay-banh",
    trangThai: "mo",
    toaDoKhongGian: { x: 2.8, z: 2.0 }
  },
  {
    id: "con-vanh",
    gian: "thaibinh",
    nhom: "am-thuc",
    ten: "Cồn Vành",
    moTaNgan: "Viên ngọc sinh thái hoang sơ nơi cửa Ba Lạt sông Hồng hòa mình vào Biển Đông.",
    cauChuyen: "Cồn Vành (huyện Tiền Hải) là bãi bồi phù sa trù phú thuộc Khu dự trữ sinh quyển châu thổ sông Hồng được UNESCO công nhận. Nơi đây bạt ngàn rừng ngập mặn sú vẹt xanh mướt, ríu rít tiếng chim di trú ven triền cát thoai thoải lộng gió ngàn khơi.",
    banCoBiet: "Cồn Vành là vùng đất trẻ được bồi đắp liên tục hàng năm từ lượng phù sa khổng lồ do dòng sông mẹ Hồng Hà mang lại.",
    mauSac: "#2A9D8F",
    hinhDang: "dio-rama-bien",
    trangThai: "mo",
    toaDoKhongGian: { x: 4.8, z: 5.0 }
  },

  // ==========================================
  // GIAN HƯNG YÊN (8 HIỆN VẬT DỰ TRỮ - TRẠNG THÁI: KHÓA)
  // ==========================================
  {
    id: "van-mieu-xich-dang",
    gian: "hungyen",
    nhom: "tin-nguong",
    ten: "Văn Miếu Xích Đằng",
    moTaNgan: "Biểu tượng truyền thống hiếu học và khoa bảng rực rỡ của đất nhãn Phố Hiến.",
    cauChuyen: "Xây dựng từ thời Hậu Lê (năm 1832 xây dựng lại quy mô lớn), Văn Miếu Xích Đằng thờ Khổng Tử và lưu giữ 9 tấm bia đá khắc tên 161 vị đại khoa đất Hưng Yên.",
    banCoBiet: "Đây là một trong số rất ít văn miếu hàng tỉnh cổ xưa còn được bảo tồn nguyên vẹn trên cả nước.",
    mauSac: "#8B4513",
    hinhDang: "van-mieu",
    trangThai: "khoa"
  },
  {
    id: "chu-dong-tu",
    gian: "hungyen",
    nhom: "tin-nguong",
    ten: "Đền Chử Đồng Tử (Đa Hòa)",
    moTaNgan: "Nơi tôn thờ một trong 'Tứ bất tử' linh thiêng của tín ngưỡng dân gian Việt.",
    cauChuyen: "Gắn liền với thiên tình sử diễm lệ giữa chàng trai nghèo Chử Đồng Tử và nàng công chúa Tiên Dung cành vàng lá ngọc bên bờ sông Hồng ngát hương sen.",
    banCoBiet: "Chử Đồng Tử là vị thánh duy nhất trong Tứ bất tử xuất thân từ tầng lớp bần nông nghèo khó không mảnh khố che thân.",
    mauSac: "#A0522D",
    hinhDang: "den-tho",
    trangThai: "khoa"
  },
  {
    id: "trong-quan",
    gian: "hungyen",
    nhom: "nghe-thuat",
    ten: "Hát trống quân Dạ Trạch",
    moTaNgan: "Nghệ thuật trình diễn dân gian đối đáp tài hoa mộc mạc bên chiếc trống dây nứa.",
    cauChuyen: "Hát trống quân phổ biến khắp vùng bãi Dạ Trạch, là điệu hát trao duyên dí dỏm của trai gái nông thôn trong những đêm trăng rằm tháng Tám vào vụ gặt.",
    banCoBiet: "Mặt trống quân sử dụng dây mây hoặc dây thép căng trên hố đất/thùng gỗ, dùng thanh nứa gõ tạo nhịp 'thình... thùng... thình'.",
    mauSac: "#C0392B",
    hinhDang: "trong-quan-day",
    trangThai: "khoa"
  },
  {
    id: "hoi-da-hoa",
    gian: "hungyen",
    nhom: "nghe-thuat",
    ten: "Lễ hội Đền Đa Hòa",
    moTaNgan: "Đại lễ rước kiệu nước sông Hồng tái hiện thiên tình sử huyền thoại ngàn năm.",
    cauChuyen: "Hội tổ chức vào tháng Hai âm lịch với đám rước rồng uy nghi trên cạn và đoàn thuyền hoa lộng lẫy lấy nước giữa dòng sông Hồng về đền thờ làm lễ tẩy trần.",
    banCoBiet: "Đoàn rước lễ hội Đa Hòa có sự tham gia liên kết của nhân dân 9 xã quanh vùng bãi sông tạo nên không khí cố kết cộng đồng sâu sắc.",
    mauSac: "#D35400",
    hinhDang: "thuyen-hoa",
    trangThai: "khoa"
  },
  {
    id: "huong-cao-thon",
    gian: "hungyen",
    nhom: "lang-nghe",
    ten: "Hương Cao Thôn",
    moTaNgan: "Làng nghề làm hương thảo mộc cổ truyền đượm nồng phong vị Tết quê hương.",
    cauChuyen: "Hương Cao Thôn (xã Bảo Khê) hơn 200 năm tuổi nổi tiếng nhờ sử dụng 36 vị thuốc bắc thảo mộc thiên nhiên (quế, hồi, đinh hương, thảo quả) mang lại hương thơm thanh khiết.",
    banCoBiet: "Tàn hương Cao Thôn uốn cong tròn đẹp mắt tượng trưng cho phúc lộc dồi dào tụ hội về với gia chủ trong năm mới.",
    mauSac: "#E67E22",
    hinhDang: "bo-huong",
    trangThai: "khoa"
  },
  {
    id: "duc-dong-long-thuong",
    gian: "hungyen",
    nhom: "lang-nghe",
    ten: "Đúc đồng Lộng Thượng",
    moTaNgan: "Làng nghề đúc đồng danh tiếng với những quả đại hồng chung và đồ thờ tinh xảo.",
    cauChuyen: "Nghề đúc đồng Lộng Thượng (Văn Lâm) có từ thời Lý - Trần. Bàn tay tài hoa của nghệ nhân đã đúc nên hàng ngàn pho tượng Phật, đỉnh đồng, chuông khánh vang vọng khắp đình chùa xứ Bắc.",
    banCoBiet: "Bí quyết pha chế hợp kim đồng - thiếc và thẩm âm chuông của thợ Lộng Thượng giúp tiếng chuông ngân xa hàng chục dặm.",
    mauSac: "#B7950B",
    hinhDang: "dinh-dong",
    trangThai: "khoa"
  },
  {
    id: "nhan-long",
    gian: "hungyen",
    nhom: "am-thuc",
    ten: "Nhãn lồng Hưng Yên",
    moTaNgan: "Sản vật 'Vương giả chi quả' cùi dày nõn nà, ngọt đậm đà danh bất hư truyền.",
    cauChuyen: "Cây nhãn tổ ở chùa Hiến hàng trăm năm tuổi vẫn trĩu quả mỗi độ thu sang. Nhãn lồng Hưng Yên cùi dày ráo nước, hạt tiêu nhỏ xíu, thơm ngọt thanh tao không nơi nào sánh bằng.",
    banCoBiet: "Tên gọi 'nhãn lồng' xuất phát từ việc xưa kia người dân dùng lồng tre bọc từng chùm nhãn quý trên cành để tránh chim chóc ăn trước khi dâng tiến nhà vua.",
    mauSac: "#F39C12",
    hinhDang: "chum-nhan",
    trangThai: "khoa"
  },
  {
    id: "tuong-ban",
    gian: "hungyen",
    nhom: "am-thuc",
    ten: "Tương Bần",
    moTaNgan: "Gia vị quốc hồn quốc túy ủ nếp cái hoa vàng trong những chum sành phơi nắng.",
    cauChuyen: "Thị trấn Bần Yên Nhân nổi tiếng với câu ca dao: 'Dưa La, húng Láng, nem Báng, tương Bần'. Tương làm từ nếp cái hoa vàng mốc xôi kết hợp đỗ tương rang xay mịn, ngấu men trong chum sành ngoài nắng hè rực rỡ.",
    banCoBiet: "Tương Bần ủ càng lâu càng sánh vàng như mật ong, vị ngọt đậm hậu vị đặc trưng không thể thiếu trong mâm cơm dân dã Bắc Bộ.",
    mauSac: "#7D6608",
    hinhDang: "chum-tuong",
    trangThai: "khoa"
  }
];
