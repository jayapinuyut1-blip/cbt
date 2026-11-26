export type GradeOption = "X" | "XI" | "XII";

export interface CapaianItem {
  id: string;
  elemen: string;
  deskripsi: string;
}

export interface SubjectCurriculum {
  keywords: string[];
  faseE: CapaianItem[]; // Kelas X SMK
  faseF: CapaianItem[]; // Kelas XI & XII SMK
}

export const GRADE_LABELS: Record<GradeOption, { label: string; fase: "E" | "F" }> = {
  X: { label: "Kelas X SMK (Fase E)", fase: "E" },
  XI: { label: "Kelas XI SMK (Fase F)", fase: "F" },
  XII: { label: "Kelas XII SMK (Fase F)", fase: "F" },
};

/**
 * Katalog Capaian Pembelajaran (CP) Kurikulum Merdeka SMK
 * Mengacu pada Keputusan Kepala BSKAP No. 032/H/KR/2024 dan pembaruan KKA Kemendikdasmen.
 */
const CURRICULUM_DB: SubjectCurriculum[] = [
  {
    keywords: ["pendidikan agama islam", "pai"],
    faseE: [
      {
        id: "pai-e-1",
        elemen: "Al-Qur'an dan Hadis",
        deskripsi:
          "Memahami ayat Al-Qur'an dan hadis tentang perintah berkompetisi dalam kebaikan (fastabiqul khairat), etos kerja, serta larangan pergaulan bebas dan perbuatan zina.",
      },
      {
        id: "pai-e-2",
        elemen: "Akidah (Syu'abul Iman)",
        deskripsi:
          "Memahami hakikat iman, cabang-cabang iman (syu'abul iman), serta penerapannya dalam menjaga integritas diri.",
      },
      {
        id: "pai-e-3",
        elemen: "Akhlak",
        deskripsi:
          "Menghindari akhlak madzmumah (berfoya-foya, riya, sum'ah, takabur, hasad) dan membiasakan akhlak mahmudah dalam kehidupan sehari-hari.",
      },
      {
        id: "pai-e-4",
        elemen: "Fikih (Kulliyatul Khamsah & Muamalah Dasar)",
        deskripsi:
          "Memahami prinsip Al-Kulliyat Al-Khamsah (lima prinsip dasar hukum Islam) serta ketentuan asuransi, bank, dan koperasi syariah.",
      },
      {
        id: "pai-e-5",
        elemen: "Sejarah Peradaban Islam",
        deskripsi:
          "Memahami sejarah masuknya Islam di Indonesia dan strategi dakwah Wali Songo secara damai serta kontekstual.",
      },
    ],
    faseF: [
      {
        id: "pai-f-1",
        elemen: "Al-Qur'an dan Hadis",
        deskripsi:
          "Memahami ayat Al-Qur'an dan hadis tentang berpikir kritis, semangat mencintai IPTEK, toleransi, memelihara kehidupan manusia, dan etika bermedia sosial.",
      },
      {
        id: "pai-f-2",
        elemen: "Akidah",
        deskripsi:
          "Memahami keterkaitan iman, Islam, dan ihsan serta cabang iman tentang memenuhi janji, mensyukuri nikmat, dan menjaga lisan.",
      },
      {
        id: "pai-f-3",
        elemen: "Akhlak",
        deskripsi:
          "Menerapkan etika pergaulan remaja, menghindari perkelahian antarpelajar/NAPZA, serta menumbuhkan sikap inovatif, kolaboratif, dan moderasi beragama.",
      },
      {
        id: "pai-f-4",
        elemen: "Fikih (Pernikahan, Mawaris & Dakwah)",
        deskripsi:
          "Memahami ketentuan khutbah, tablig, dakwah, penyelenggaraan jenazah, pernikahan dalam Islam, dan hukum kewarisan (mawaris).",
      },
      {
        id: "pai-f-5",
        elemen: "Sejarah Peradaban Islam",
        deskripsi:
          "Menganalisis peradaban Islam masa kejayaan, masa modern, peran ulama Nusantara, dan perkembangan organisasi Islam di Indonesia.",
      },
    ],
  },
  {
    keywords: ["pendidikan agama kristen", "pak", "agama kristen"],
    faseE: [
      {
        id: "pak-e-1",
        elemen: "Allah Berkarya",
        deskripsi:
          "Memahami bentuk-bentuk pemeliharaan dan karya Allah dalam dinamika kehidupan pribadi, keluarga, serta pertumbuhan menuju kedewasaan iman.",
      },
      {
        id: "pak-e-2",
        elemen: "Manusia dan Nilai-Nilai Kristiani",
        deskripsi:
          "Mengembangkan rasio, kepekaan hati nurani, kesetiaan, kasih, dan tanggung jawab diri sebagai remaja Kristen di era digital.",
      },
      {
        id: "pak-e-3",
        elemen: "Gereja dan Masyarakat Majemuk",
        deskripsi:
          "Memahami arti pelayanan gereja serta hidup berdampingan dalam masyarakat majemuk dengan semangat toleransi dan moderasi beragama.",
      },
      {
        id: "pak-e-4",
        elemen: "Masyarakat dan Lingkungan Hidup",
        deskripsi:
          "Memahami tanggung jawab orang beriman terhadap pelestarian alam, keadilan sosial, dan lingkungan hidup sekitar.",
      },
    ],
    faseF: [
      {
        id: "pak-f-1",
        elemen: "Allah Berkarya (Peran Roh Kudus)",
        deskripsi:
          "Memahami peran Allah dan pimpinan Roh Kudus dalam membimbing keluarga serta orang beriman menghadapi tantangan zaman modern.",
      },
      {
        id: "pak-f-2",
        elemen: "Manusia dan Nilai-Nilai Kristiani",
        deskripsi:
          "Mengaplikasikan keteladanan Yesus Kristus dalam pergaulan remaja, gaya hidup modern, rendah hati, penguasaan diri, dan persahabatan sejati.",
      },
      {
        id: "pak-f-3",
        elemen: "Gereja dan Masyarakat Majemuk",
        deskripsi:
          "Memahami peran gereja pembawa pembaruan, demokrasi, HAM, keadilan, perdamaian, dan dialog antarumat beragama.",
      },
      {
        id: "pak-f-4",
        elemen: "Masyarakat dan Lingkungan Hidup",
        deskripsi:
          "Mewujudkan penatalayanan (stewardship) alam secara berkelanjutan dan etika Kristen dalam menyikapi perkembangan IPTEK serta dunia kerja.",
      },
    ],
  },
  {
    keywords: ["pkn", "pendidikan pancasila", "ppkn"],
    faseE: [
      {
        id: "pkn-e-1",
        elemen: "Pancasila",
        deskripsi:
          "Menganalisis cara pandang para pendiri negara tentang rumusan Pancasila, kedudukan Pancasila sebagai dasar negara, pandangan hidup, dan ideologi negara.",
      },
      {
        id: "pkn-e-2",
        elemen: "UUD NRI Tahun 1945",
        deskripsi:
          "Menerapkan perilaku taat hukum berdasarkan peraturan perundang-undangan, tata urutan perundangan, serta hak dan kewajiban warga negara.",
      },
      {
        id: "pkn-e-3",
        elemen: "Bhinneka Tunggal Ika",
        deskripsi:
          "Menyajikan asal-usul dan makna semboyan Bhinneka Tunggal Ika sebagai modal sosial dalam membangun harmoni di tengah keberagaman.",
      },
      {
        id: "pkn-e-4",
        elemen: "Negara Kesatuan Republik Indonesia",
        deskripsi:
          "Memahami konsep wilayah NKRI, wawasan nusantara, serta perilaku menjaga keutuhan wilayah dan kedaulatan bangsa.",
      },
    ],
    faseF: [
      {
        id: "pkn-f-1",
        elemen: "Pancasila",
        deskripsi:
          "Mendeskripsikan rumusan dan keterkaitan sila-sila Pancasila, peluang serta tantangan penerapan Pancasila dalam kehidupan global dan dunia kerja.",
      },
      {
        id: "pkn-f-2",
        elemen: "UUD NRI Tahun 1945",
        deskripsi:
          "Menganalisis periodisasi konstitusi, kasus pelanggaran hak dan pengingkaran kewajiban, serta sistem pemerintahan dan lembaga negara.",
      },
      {
        id: "pkn-f-3",
        elemen: "Bhinneka Tunggal Ika",
        deskripsi:
          "Menganalisis potensi konflik keberagaman, cara penyelesaian konflik secara damai, serta menjaga persatuan dalam masyarakat multikultural.",
      },
      {
        id: "pkn-f-4",
        elemen: "Negara Kesatuan Republik Indonesia",
        deskripsi:
          "Menganalisis sistem pertahanan dan keamanan negara, peran Indonesia dalam hubungan internasional, serta praktik demokrasi Pancasila.",
      },
    ],
  },
  {
    keywords: ["bahasa indonesia", "b. indonesia", "bah. indonesia"],
    faseE: [
      {
        id: "bind-e-1",
        elemen: "Teks Laporan Hasil Observasi (LHO)",
        deskripsi:
          "Mengevaluasi informasi, struktur, kaidah kebahasaan, dan objektivitas teks laporan hasil observasi.",
      },
      {
        id: "bind-e-2",
        elemen: "Teks Anekdot & Kritik Sosial",
        deskripsi:
          "Menganalisis pesan tersirat, struktur, majas sindiran, dan unsur humor dalam teks anekdot.",
      },
      {
        id: "bind-e-3",
        elemen: "Teks Hikayat & Cerpen",
        deskripsi:
          "Memahami nilai-nilai kehidupan, karakteristik bahasa, serta alih wahana teks hikayat ke cerita pendek.",
      },
      {
        id: "bind-e-4",
        elemen: "Teks Negosiasi",
        deskripsi:
          "Menganalisis struktur, strategi kesepakatan, dan bahasa persuasif dalam teks negosiasi di dunia usaha/kerja.",
      },
      {
        id: "bind-e-5",
        elemen: "Teks Biografi & Puisi",
        deskripsi:
          "Mengidentifikasi keteladanan tokoh dalam teks biografi serta menganalisis diksi, majas, dan makna puisi.",
      },
    ],
    faseF: [
      {
        id: "bind-f-1",
        elemen: "Teks Argumentasi & Berita",
        deskripsi:
          "Mengevaluasi gagasan, fakta, opini, kohesi, dan koherensi dalam teks argumentasi serta berita aktual.",
      },
      {
        id: "bind-f-2",
        elemen: "Teks Prosedur & Proposal",
        deskripsi:
          "Menyusun dan menganalisis sistematika, kelengkapan isi, dan kebahasaan teks prosedur kerja serta proposal kegiatan/usaha.",
      },
      {
        id: "bind-f-3",
        elemen: "Karya Ilmiah & Resensi",
        deskripsi:
          "Menganalisis struktur karya tulis ilmiah, penulisan kutipan/daftar pustaka, serta penilaian karya dalam resensi.",
      },
      {
        id: "bind-f-4",
        elemen: "Surat Lamaran Pekerjaan & Teks Editorial",
        deskripsi:
          "Menyusun surat lamaran pekerjaan sesuai kaidah EYD V dan menganalisis isu aktual pada teks editorial/opini.",
      },
      {
        id: "bind-f-5",
        elemen: "Apresiasi Prosa & Drama",
        deskripsi:
          "Menganalisis unsur intrinsik, ekstrinsik, dan nilai kemanusiaan dalam cerpen, novel, serta naskah drama.",
      },
    ],
  },
  {
    keywords: ["matematika"],
    faseE: [
      {
        id: "mtk-e-1",
        elemen: "Bilangan (Eksponen & Logaritma)",
        deskripsi:
          "Menggeneralisasi sifat-sifat bilangan berpangkat (eksponen), bentuk akar, dan logaritma serta penerapannya.",
      },
      {
        id: "mtk-e-2",
        elemen: "Barisan dan Deret",
        deskripsi:
          "Menerapkan konsep barisan dan deret aritmetika maupun geometri, termasuk bunga tunggal dan bunga majemuk.",
      },
      {
        id: "mtk-e-3",
        elemen: "Aljabar dan Fungsi",
        deskripsi:
          "Menyelesaikan sistem persamaan linear tiga variabel (SPLTV), sistem pertidaksamaan linear, serta fungsi dan persamaan kuadrat.",
      },
      {
        id: "mtk-e-4",
        elemen: "Geometri (Trigonometri Dasar)",
        deskripsi:
          "Menentukan perbandingan trigonometri (sin, cos, tan) pada segitiga siku-siku untuk menyelesaikan masalah kontekstual.",
      },
      {
        id: "mtk-e-5",
        elemen: "Analisis Data dan Peluang",
        deskripsi:
          "Menentukan ukuran pemusatan (mean, median, modus), ukuran penyebaran data (kuartil, simpangan), serta peluang kejadian majemuk.",
      },
    ],
    faseF: [
      {
        id: "mtk-f-1",
        elemen: "Bilangan (Keuangan: Bunga Majemuk & Anuitas)",
        deskripsi:
          "Memodelkan pinjaman dan investasi dengan bunga majemuk dan anuitas dalam konteks bisnis/kejuruan.",
      },
      {
        id: "mtk-f-2",
        elemen: "Aljabar & Fungsi (Matriks, Fungsi Komposisi & Invers)",
        deskripsi:
          "Menentukan fungsi komposisi, fungsi invers, serta operasi, determinan, dan invers matriks dalam pemecahan masalah.",
      },
      {
        id: "mtk-f-3",
        elemen: "Geometri (Lingkaran & Transformasi Geometri)",
        deskripsi:
          "Menerapkan teorema lingkaran (garis singgung, busur, juring) serta translasi, refleksi, rotasi, dan dilatasi.",
      },
      {
        id: "mtk-f-4",
        elemen: "Analisis Data dan Peluang Lanjut",
        deskripsi:
          "Menganalisis diagram pencar (regresi linear sederhana), kaidah pencacahan (permutasi & kombinasi), dan peluang bersyarat.",
      },
      {
        id: "mtk-f-5",
        elemen: "Kalkulus Dasar (Limit & Turunan)",
        deskripsi:
          "Memahami konsep limit fungsi aljabar dan turunan pertama untuk menentukan nilai optimum dalam masalah kejuruan.",
      },
    ],
  },
  {
    keywords: ["sejarah"],
    faseE: [
      {
        id: "sej-e-1",
        elemen: "Konsep Dasar Ilmu Sejarah",
        deskripsi:
          "Memahami konsep manusia, ruang, waktu, diakronik, sinkronik, perubahan dan keberlanjutan, serta langkah penelitian sejarah.",
      },
      {
        id: "sej-e-2",
        elemen: "Asal-Usul Nenek Moyang & Jalur Rempah",
        deskripsi:
          "Menganalisis asal-usul nenek moyang bangsa Indonesia, kehidupan masa praaksara, dan jaringan jalur rempah Nusantara.",
      },
      {
        id: "sej-e-3",
        elemen: "Kerajaan Hindu-Buddha di Nusantara",
        deskripsi:
          "Menganalisis teori masuknya Hindu-Buddha, kerajaan maritim dan agraris (Kutai, Sriwijaya, Majapahit), serta warisan budayanya.",
      },
      {
        id: "sej-e-4",
        elemen: "Kerajaan Islam di Nusantara",
        deskripsi:
          "Menganalisis proses masuk dan berkembangnya Islam, jaringan perdagangan, serta kesultanan Islam di Indonesia.",
      },
    ],
    faseF: [
      {
        id: "sej-f-1",
        elemen: "Kolonialisme & Perlawanan Bangsa Indonesia",
        deskripsi:
          "Menganalisis dampak penjajahan bangsa Eropa (VOC, Hindia Belanda) serta perlawanan rakyat di berbagai daerah.",
      },
      {
        id: "sej-f-2",
        elemen: "Pergerakan Kebangsaan Indonesia",
        deskripsi:
          "Menganalisis lahirnya organisasi pergerakan nasional (Budi Utomo, Sarekat Islam, Indische Partij, Sumpah Pemuda) hingga pendudukan Jepang.",
      },
      {
        id: "sej-f-3",
        elemen: "Proklamasi & Mempertahankan Kemerdekaan",
        deskripsi:
          "Menganalisis peristiwa sekitar Proklamasi 17 Agustus 1945, pembentukan pemerintahan, serta perjuangan fisik dan diplomasi.",
      },
      {
        id: "sej-f-4",
        elemen: "Demokrasi Liberal, Terpimpin, Orde Baru & Reformasi",
        deskripsi:
          "Mengevaluasi dinamika politik, ekonomi, dan sosial Indonesia dari masa pascakemerdekaan, Orde Baru, hingga era Reformasi.",
      },
    ],
  },
  {
    keywords: ["bahasa inggris", "english"],
    faseE: [
      {
        id: "bing-e-1",
        elemen: "Descriptive Text & Introducing Self",
        deskripsi:
          "Memahami dan menyusun teks deskriptif tentang orang, tempat wisata, atau benda kerja menggunakan Simple Present Tense.",
      },
      {
        id: "bing-e-2",
        elemen: "Recount Text",
        deskripsi:
          "Menganalisis struktur, informasi rinci, dan unsur kebahasaan (Simple Past Tense) dalam teks recount pengalaman atau peristiwa.",
      },
      {
        id: "bing-e-3",
        elemen: "Narrative Text",
        deskripsi:
          "Memahami alur cerita, karakter, pesan moral, dan kebahasaan teks naratif (folktales, fables, legends).",
      },
      {
        id: "bing-e-4",
        elemen: "Procedure Text (Manual & Tips)",
        deskripsi:
          "Memahami langkah kerja operasional (SOP/manual alat) menggunakan imperative sentences dan sequence connectors.",
      },
      {
        id: "bing-e-5",
        elemen: "Exposition & Functional Texts",
        deskripsi:
          "Mengidentifikasi gagasan utama dan argumen pada teks eksposisi sederhana, pengumuman (announcement), dan graffiti/poster.",
      },
    ],
    faseF: [
      {
        id: "bing-f-1",
        elemen: "Analytical & Hortatory Exposition",
        deskripsi:
          "Mengevaluasi tesis, argumen, dan rekomendasi pada teks eksposisi terkait isu teknologi, lingkungan, dan dunia kerja.",
      },
      {
        id: "bing-f-2",
        elemen: "Application Letter & Job Interview",
        deskripsi:
          "Menyusun surat lamaran kerja (application letter), CV, serta dialog wawancara kerja profesional dalam bahasa Inggris.",
      },
      {
        id: "bing-f-3",
        elemen: "Business Correspondence & Report Text",
        deskripsi:
          "Memahami email bisnis, memo, offering/complaint letter, serta factual report terkait bidang kejuruan SMK.",
      },
      {
        id: "bing-f-4",
        elemen: "Discussion Text & Cause-Effect",
        deskripsi:
          "Menganalisis sudut pandang pro dan kontra dalam teks diskusi serta penggunaan ungkapan sebab-akibat dan conditional sentences.",
      },
    ],
  },
  {
    keywords: ["pjok", "penjaskes", "olahraga"],
    faseE: [
      {
        id: "pjok-e-1",
        elemen: "Permainan Bola Besar & Bola Kecil",
        deskripsi:
          "Menganalisis teknik dasar, peraturan, dan strategi permainan sepak bola, bola voli, bola basket, bulu tangkis, atau tenis meja.",
      },
      {
        id: "pjok-e-2",
        elemen: "Atletik & Bela Diri",
        deskripsi:
          "Memahami teknik lari jarak pendek, lompat jauh, tolak peluru, serta prinsip dasar pencak silat.",
      },
      {
        id: "pjok-e-3",
        elemen: "Senam & Aktivitas Gerak Berirama",
        deskripsi:
          "Memahami keterampilan gerak senam lantai serta koordinasi gerak berirama untuk kelenturan dan keseimbangan.",
      },
      {
        id: "pjok-e-4",
        elemen: "Kebugaran Jasmani & Kesehatan",
        deskripsi:
          "Merancang latihan komponen kebugaran jasmani serta memahami pencegahan pergaulan bebas dan bahaya penyalahgunaan NAPZA.",
      },
    ],
    faseF: [
      {
        id: "pjok-f-1",
        elemen: "Taktik & Strategi Permainan Olahraga",
        deskripsi:
          "Mengevaluasi pola penyerangan dan pertahanan dalam permainan bola besar, bola kecil, dan bela diri secara sportif.",
      },
      {
        id: "pjok-f-2",
        elemen: "Program Latihan Kebugaran Jasmani",
        deskripsi:
          "Merancang dan mengukur program latihan peningkatan daya tahan, kekuatan, kecepatan, dan kelincahan sesuai kebutuhan kerja.",
      },
      {
        id: "pjok-f-3",
        elemen: "Kesehatan Reproduksi, Gizi & P3K",
        deskripsi:
          "Memahami pola makan bergizi seimbang, pencegahan penyakit menular/HIV-AIDS, manajemen stres, dan pertolongan pertama cedera.",
      },
    ],
  },
  {
    keywords: ["seni budaya", "seni"],
    faseE: [
      {
        id: "seni-e-1",
        elemen: "Mengalami & Apresiasi Seni",
        deskripsi:
          "Mengidentifikasi unsur, prinsip, gaya, dan makna estetis pada karya seni rupa, musik, tari, atau teater Nusantara.",
      },
      {
        id: "seni-e-2",
        elemen: "Menciptakan & Eksplorasi Media",
        deskripsi:
          "Menerapkan teknik, bahan, alat, dan prosedur berkarya seni dua/tiga dimensi atau pertunjukan kreatif.",
      },
      {
        id: "seni-e-3",
        elemen: "Merefleksikan & Kearifan Lokal",
        deskripsi:
          "Mengevaluasi karya seni sendiri dan orang lain serta menggali nilai budaya dan kearifan lokal dalam karya seni.",
      },
      {
        id: "seni-e-4",
        elemen: "Berdampak & Pameran/Pertunjukan",
        deskripsi:
          "Merencanakan pergelaran, pameran seni, dan kritik seni yang memberi dampak positif bagi lingkungan sekolah dan masyarakat.",
      },
    ],
    faseF: [
      {
        id: "seni-f-1",
        elemen: "Pengembangan Konsep & Kritik Seni",
        deskripsi:
          "Menganalisis fungsi seni kontemporer, estetika desain, serta menulis ulasan kritik seni secara objektif.",
      },
      {
        id: "seni-f-2",
        elemen: "Kolaborasi & Kreativitas Seni Terapan",
        deskripsi:
          "Merancang karya seni terapan atau pertunjukan kolaboratif yang terhubung dengan industri kreatif dan media digital.",
      },
    ],
  },
  {
    keywords: ["informatika"],
    faseE: [
      {
        id: "inf-e-1",
        elemen: "Berpikir Komputasional (BK)",
        deskripsi:
          "Menerapkan strategi algoritmik standar (pencarian/searching, pengurutan/sorting, tumpukan/stack, antrean/queue) untuk memecahkan masalah.",
      },
      {
        id: "inf-e-2",
        elemen: "Teknologi Informasi dan Komunikasi (TIK)",
        deskripsi:
          "Memanfaatkan integrasi aplikasi perkantoran (pengolah kata, angka, presentasi) secara mahir dan otomatis.",
      },
      {
        id: "inf-e-3",
        elemen: "Sistem Komputer (SK)",
        deskripsi:
          "Memahami peran sistem operasi, mekanisme internal komputer (CPU, memori, I/O), dan interaksi perangkat keras-lunak.",
      },
      {
        id: "inf-e-4",
        elemen: "Jaringan Komputer dan Internet (JKI)",
        deskripsi:
          "Memahami konektivitas jaringan lokal dan internet, proteksi data, enkripsi, serta keamanan siber dasar.",
      },
      {
        id: "inf-e-5",
        elemen: "Analisis Data (AD)",
        deskripsi:
          "Memahami aspek privasi data, pengumpulan, transformasi, visualisasi, dan interpretasi data dalam jumlah besar.",
      },
      {
        id: "inf-e-6",
        elemen: "Algoritma dan Pemrograman (AP)",
        deskripsi:
          "Menulis program prosedural menggunakan variabel, percabangan, perulangan, dan fungsi berdasarkan flowchart/pseudocode.",
      },
      {
        id: "inf-e-7",
        elemen: "Dampak Sosial Informatika (DSI)",
        deskripsi:
          "Memahami sejarah komputasi, aspek ekonomi dan hukum (HAKI/lisensi perangkat lunak), serta profesi bidang informatika.",
      },
    ],
    faseF: [
      {
        id: "inf-f-1",
        elemen: "Berpikir Komputasional & Algoritma Lanjut",
        deskripsi:
          "Menganalisis rekursi, struktur data lanjut (graf, pohon), serta pemrograman modular dan berorientasi objek.",
      },
      {
        id: "inf-f-2",
        elemen: "Jaringan, Keamanan Siber & Analisis Data",
        deskripsi:
          "Menerapkan keamanan jaringan, basis data relasional, serta pemrosesan data untuk mendukung pengambilan keputusan.",
      },
      {
        id: "inf-f-3",
        elemen: "Dampak Sosial & Praktik Lintas Bidang",
        deskripsi:
          "Mengembangkan artefak komputasional secara kolaboratif serta mengevaluasi etika digital di dunia industri.",
      },
    ],
  },
  {
    keywords: ["kka", "koding", "kecerdasan artifisial"],
    faseE: [
      {
        id: "kka-e-1",
        elemen: "Berpikir Komputasional",
        deskripsi:
          "Menerapkan berpikir komputasional (dekomposisi, pengenalan pola, abstraksi, algoritma) untuk memecahkan permasalahan kompleks sesuai bidang keahlian.",
      },
      {
        id: "kka-e-2",
        elemen: "Literasi Digital",
        deskripsi:
          "Menganalisis tahapan dan kebutuhan pengembangan KA serta menerapkan produksi dan diseminasi konten digital multimedia.",
      },
      {
        id: "kka-e-3",
        elemen: "Algoritma Pemrograman",
        deskripsi:
          "Membandingkan beberapa algoritma dan menerapkan algoritma pemrograman untuk menghasilkan aplikasi sederhana.",
      },
      {
        id: "kka-e-4",
        elemen: "Analisis Data & Basis Data",
        deskripsi:
          "Memahami konsep dasar basis data (tabel, relasi, query dasar) dan menerapkan pengolahan data terstruktur.",
      },
      {
        id: "kka-e-5",
        elemen: "Literasi dan Etika Kecerdasan Artifisial",
        deskripsi:
          "Memahami cara kerja KA mengenali pola citra/suara, profesi di bidang KA, bias AI, serta tanggung jawab etika dan hukum manusia dalam penggunaan KA.",
      },
      {
        id: "kka-e-6",
        elemen: "Pemanfaatan dan Pengembangan KA",
        deskripsi:
          "Menerapkan prompt engineering pada KA generatif, mengevaluasi keakuratan konten berbasis KA, dan memahami perancangan sistem AI melalui design thinking.",
      },
    ],
    faseF: [
      {
        id: "kka-f-1",
        elemen: "Berpikir Komputasional & Prediksi",
        deskripsi:
          "Menerapkan berpikir komputasional untuk memecahkan permasalahan kompleks di masyarakat dan membuat pemodelan prediksi.",
      },
      {
        id: "kka-f-2",
        elemen: "Algoritma Pemrograman & IoT",
        deskripsi:
          "Menerapkan pemrograman berorientasi objek (OOP), rekayasa perangkat lunak, serta pengembangan aplikasi terintegrasi IoT.",
      },
      {
        id: "kka-f-3",
        elemen: "Analisis Data & Big Data",
        deskripsi:
          "Memahami data encoding, integrasi basis data dalam aplikasi, serta konsep mahadata (big data).",
      },
      {
        id: "kka-f-4",
        elemen: "Etika KA Human-Centered",
        deskripsi:
          "Menganalisis dampak KA terhadap ketenagakerjaan serta kepatuhan pengembang pada prinsip human-centered AI dan regulasi data.",
      },
      {
        id: "kka-f-5",
        elemen: "Machine Learning & NLP Dasar",
        deskripsi:
          "Memahami dasar Machine Learning (supervised/unsupervised), Natural Language Processing (NLP), serta mengintegrasikan model KA ke dalam aplikasi nyata.",
      },
    ],
  },
  {
    keywords: ["projek ipas", "ipas"],
    faseE: [
      {
        id: "ipas-e-1",
        elemen: "Makhluk Hidup dan Lingkungannya",
        deskripsi:
          "Menjelaskan keterkaitan makhluk hidup (biotik) dan faktor abiotik, ekosistem, rantai makanan, serta dampak pencemaran lingkungan.",
      },
      {
        id: "ipas-e-2",
        elemen: "Zat dan Perubahannya",
        deskripsi:
          "Menganalisis sifat fisika dan kimia zat, klasifikasi unsur/senyawa/campuran, pemisahan campuran, serta perubahan fisika dan kimia.",
      },
      {
        id: "ipas-e-3",
        elemen: "Energi dan Perubahannya",
        deskripsi:
          "Memahami bentuk energi, usaha, hukum kekekalan energi, transformasi energi, dan pengembangan energi terbarukan.",
      },
      {
        id: "ipas-e-4",
        elemen: "Bumi dan Antariksa",
        deskripsi:
          "Memahami struktur lapisan bumi, sistem tata surya, gravitasi, perubahan iklim, serta mitigasi bencana alam.",
      },
      {
        id: "ipas-e-5",
        elemen: "Keruangan dan Konektivitas Antarruang & Waktu",
        deskripsi:
          "Menganalisis kondisi geografis Indonesia, interaksi antarruang, dinamika kependudukan, serta dampaknya pada kegiatan ekonomi dan sosial.",
      },
      {
        id: "ipas-e-6",
        elemen: "Interaksi, Komunikasi, Sosialisasi & Dinamika Sosial",
        deskripsi:
          "Memahami syarat interaksi sosial, lembaga sosial, norma, konflik sosial, serta peran komunikasi dalam kehidupan bermasyarakat.",
      },
      {
        id: "ipas-e-7",
        elemen: "Perilaku Ekonomi dan Kesejahteraan",
        deskripsi:
          "Menganalisis kebutuhan, kelangkaan, kegiatan produksi-distribusi-konsumsi, permintaan-penawaran, pasar, serta literasi keuangan.",
      },
    ],
    faseF: [
      {
        id: "ipas-f-1",
        elemen: "Penyelidikan Ilmiah & Refleksi Data IPAS",
        deskripsi:
          "Merancang penyelidikan ilmiah, mengevaluasi data bukti ilmiah, dan memecahkan isu sains-sosial kontekstual sesuai bidang keahlian SMK.",
      },
    ],
  },
  {
    keywords: ["geologi pertambangan", "geologi"],
    faseE: [
      {
        id: "gp-e-1",
        elemen: "Proses Bisnis Pertambangan Menyeluruh",
        deskripsi:
          "Memahami tahapan proses bisnis pertambangan: prospeksi, eksplorasi, studi kelayakan, perencanaan tambang, konstruksi, penambangan, pengolahan, serta reklamasi pascatambang.",
      },
      {
        id: "gp-e-2",
        elemen: "Perkembangan Teknologi & Isu Global Pertambangan",
        deskripsi:
          "Memahami teknologi pertambangan konvensional hingga Industri 4.0, digitalisasi tambang, isu lingkungan/perubahan iklim, ketenagakerjaan, dan umur tambang (life of mine).",
      },
      {
        id: "gp-e-3",
        elemen: "Profesi, Kewirausahaan & Peluang Usaha",
        deskripsi:
          "Memahami profil profesi (job-profile), technopreneur, dan peluang usaha di bidang geologi pertambangan.",
      },
      {
        id: "gp-e-4",
        elemen: "K3LH dan Budaya Kerja Industri (5R)",
        deskripsi:
          "Menerapkan Keselamatan dan Kesehatan Kerja Pertambangan, APD, identifikasi bahaya, prosedur keadaan darurat, dan budaya kerja 5R.",
      },
      {
        id: "gp-e-5",
        elemen: "Gambar Teknik Dasar Geologi Pertambangan",
        deskripsi:
          "Memahami standar simbol, skala, proyeksi, dan pembuatan gambar teknik dasar serta pembacaan peta topografi/geologi dasar.",
      },
      {
        id: "gp-e-6",
        elemen: "Dasar-Dasar Geologi",
        deskripsi:
          "Memahami ruang lingkup geologi, struktur bumi, siklus dan jenis batuan (beku, sedimen, metamorf), mineral, gaya endogen-eksogen, bentang alam, serta alat geologi lapangan (palu, kompas geologi, lup).",
      },
      {
        id: "gp-e-7",
        elemen: "Teknik Dasar Penambangan",
        deskripsi:
          "Memahami metode tambang terbuka (surface mining) dan tambang bawah tanah (underground mining), operasional dasar, serta fungsi alat berat pertambangan.",
      },
    ],
    faseF: [
      {
        id: "gp-f-1",
        elemen: "Pemetaan Geologi & Survei Topografi",
        deskripsi:
          "Melaksanakan pengukuran lapangan (kompas geologi, GPS, teodolit/total station), plotting data singkapan, dan pembuatan peta geologi.",
      },
      {
        id: "gp-f-2",
        elemen: "Geologi Struktur & Stratigrafi",
        deskripsi:
          "Menganalisis struktur geologi (lipatan, sesar, kekar), kedudukan lapisan batuan (strike/dip), serta korelasi stratigrafi.",
      },
      {
        id: "gp-f-3",
        elemen: "Eksplorasi & Pengambilan Sampel Bahan Galian",
        deskripsi:
          "Menerapkan teknik sampling (channel, grab, core logging), pemboran eksplorasi, serta estimasi sumber daya dan cadangan mineral/batubara.",
      },
      {
        id: "gp-f-4",
        elemen: "Pengolahan Bahan Galian & Lingkungan Tambang",
        deskripsi:
          "Memahami preparasi sampel, kominusi, konsentrasi mineral, pengelolaan air asam tambang, dan reklamasi lahan bekas tambang.",
      },
    ],
  },
  {
    keywords: ["agribisnis tanaman", "atph", "pertanian"],
    faseE: [
      {
        id: "at-e-1",
        elemen: "Proses Bisnis Agribisnis Tanaman & K3LH",
        deskripsi:
          "Memahami manajemen produksi agribisnis tanaman, penerapan K3LH, rantai pasok (supply chain), logistik, serta penggunaan dan perawatan alsintan.",
      },
      {
        id: "at-e-2",
        elemen: "Perkembangan Teknologi & Isu Global Pertanian",
        deskripsi:
          "Memahami urban farming, alat mesin pertanian modern berbasis IoT/smart farming, bioteknologi, pertanian berkelanjutan, dan isu ketahanan pangan.",
      },
      {
        id: "at-e-3",
        elemen: "Agripreneur, Profesi & Peluang Usaha",
        deskripsi:
          "Mengidentifikasi profil agripreneur, peluang pasar, dan berbagai profesi di sektor agribisnis tanaman.",
      },
      {
        id: "at-e-4",
        elemen: "Teknis Dasar Proses Produksi Tanaman",
        deskripsi:
          "Menjelaskan tahapan persiapan lahan, media tanam, persemaian, penanaman, pemeliharaan, panen, pascapanen, pengemasan, dan distribusi.",
      },
      {
        id: "at-e-5",
        elemen: "Faktor Pengaruh Produksi Tanaman",
        deskripsi:
          "Mengidentifikasi pengaruh faktor edafik (tanah), klimatik (iklim/cuaca), genetik, biotik (hama/penyakit/gulma), dan pirik terhadap pertumbuhan tanaman.",
      },
      {
        id: "at-e-6",
        elemen: "Pembiakan Tanaman (Generatif & Vegetatif)",
        deskripsi:
          "Menerapkan teknik perbanyakan tanaman secara generatif (benih) maupun vegetatif alami/buatan (stek, cangkok, okulasi, sambung pucuk/grafting, kultur jaringan).",
      },
    ],
    faseF: [
      {
        id: "at-f-1",
        elemen: "Penyiapan Lahan, Media Tanam & Pembibitan",
        deskripsi:
          "Menerapkan pengolahan tanah, pengapuran, pemupukan dasar, pemasangan mulsa, dan teknik penyemaian hingga pindah tanam (transplanting).",
      },
      {
        id: "at-f-2",
        elemen: "Pemeliharaan Tanaman (Pemupukan & Irigasi)",
        deskripsi:
          "Menghitung kebutuhan pupuk organik/anorganik, teknik pengairan/irigasi, pemangkasan, penyulaman, dan pembumbunan tanaman pangan/hortikultura.",
      },
      {
        id: "at-f-3",
        elemen: "Pengendalian OPT (Hama, Penyakit & Gulma)",
        deskripsi:
          "Mengidentifikasi gejala serangan OPT dan menerapkan Pengendalian Hama Terpadu (PHT) secara kultur teknis, hayati, mekanis, dan kimiawi bijaksana.",
      },
      {
        id: "at-f-4",
        elemen: "Panen, Pascapanen & Pemasaran Hasil",
        deskripsi:
          "Menentukan kriteria matang panen, sortasi, grading, penyimpanan, pengemasan, dan analisis usaha tani hasil panen.",
      },
    ],
  },
  {
    keywords: ["jaringan telekomunikasi", "transmisi", "tjkt", "telekomunikasi"],
    faseE: [
      {
        id: "t3-e-1",
        elemen: "Wawasan Dunia Kerja & Teknologi Telekomunikasi",
        deskripsi:
          "Memahami proses bisnis, profesi technopreneur, dan perkembangan teknologi 3G/4G/5G, VSAT, Microwave Link, Fiber Optik, IPv6, Data Center, IoT, dan Cloud Computing.",
      },
      {
        id: "t3-e-2",
        elemen: "Kecakapan Kerja Dasar, K3LH & Budaya Kerja",
        deskripsi:
          "Menerapkan K3LH di lingkungan kerja jaringan/menara telekomunikasi, pencegahan bahaya listrik/ketinggian, prosedur darurat, dan budaya kerja 5R.",
      },
      {
        id: "t3-e-3",
        elemen: "Dasar Teknik Jaringan Komputer & Telekomunikasi",
        deskripsi:
          "Memahami topologi jaringan, model OSI & TCP/IP, pengalamatan IPv4/subnetting dasar, serta fungsi perangkat aktif (router, switch, access point).",
      },
      {
        id: "t3-e-4",
        elemen: "Media dan Jaringan Telekomunikasi",
        deskripsi:
          "Memahami prinsip dasar sistem telekomunikasi, karakteristik media transmisi (UTP/STP, koaksial, fiber optik, gelombang radio/nirkabel), dan terminasi kabel.",
      },
      {
        id: "t3-e-5",
        elemen: "Penggunaan Alat Ukur Jaringan",
        deskripsi:
          "Mengidentifikasi dan menggunakan alat ukur jaringan telekomunikasi seperti LAN Tester, Multimeter, Optical Power Meter (OPM), dan OTDR.",
      },
    ],
    faseF: [
      {
        id: "t3-f-1",
        elemen: "Sistem Transmisi Fiber Optik (FTTH/GPON)",
        deskripsi:
          "Merancang, menyambung (fusion splicing), menguji redaman (OPM/OTDR), dan memelihara jaringan akses serta backbone serat optik.",
      },
      {
        id: "t3-f-2",
        elemen: "Sistem Transmisi Radio, Microwave & Satelit",
        deskripsi:
          "Memahami propagasi gelombang radio, antena, line of sight (LoS), perhitungan link budget, microwave link, dan sistem VSAT.",
      },
      {
        id: "t3-f-3",
        elemen: "Administrasi & Keamanan Jaringan Telekomunikasi",
        deskripsi:
          "Mengonfigurasi VLAN, routing statis/dinamis, layanan server jaringan, firewall, dan pemantauan kualitas layanan (QoS).",
      },
      {
        id: "t3-f-4",
        elemen: "Troubleshooting & Pemeliharaan Sistem Transmisi",
        deskripsi:
          "Mendiagnosis gangguan link transmisi kabel maupun nirkabel serta menyusun laporan pemeliharaan berkala sesuai SLA.",
      },
    ],
  },
  {
    keywords: ["pemasaran", "bisnis digital", "marketing"],
    faseE: [
      {
        id: "pm-e-1",
        elemen: "Proses Bisnis Bidang Pemasaran",
        deskripsi:
          "Menjelaskan konsep pemasaran, bauran pemasaran (4P/7P), segmentasi-targeting-positioning (STP), serta alur bisnis pemasaran di berbagai industri.",
      },
      {
        id: "pm-e-2",
        elemen: "Perkembangan Teknologi & Digital Marketing",
        deskripsi:
          "Menjelaskan transformasi pemasaran konvensional ke digital marketing, e-commerce, marketplace, media sosial, dan tren transaksi digital.",
      },
      {
        id: "pm-e-3",
        elemen: "Profesi & Peluang Usaha Pemasaran",
        deskripsi:
          "Mengidentifikasi profil profesi (kasir, pramuniaga, sales, merchandiser, digital marketer) serta peluang usaha (dropshipping, affiliate marketing, content creator).",
      },
      {
        id: "pm-e-4",
        elemen: "Pengelolaan Bisnis & SOP Pemasaran",
        deskripsi:
          "Memahami pengelolaan operasional dasar usaha ritel/online, manajemen persediaan, manajemen risiko, dan kepatuhan SOP.",
      },
      {
        id: "pm-e-5",
        elemen: "Pelayanan Prima (Service Excellence)",
        deskripsi:
          "Menerapkan standar penampilan (grooming), etika pelayanan pelanggan, dan teknik penanganan keluhan pelanggan secara profesional.",
      },
      {
        id: "pm-e-6",
        elemen: "Komunikasi Bisnis & Perilaku Konsumen",
        deskripsi:
          "Menerapkan teknik komunikasi pemasaran lisan/tulisan yang persuasif serta menganalisis faktor psikologis dan sosial perilaku konsumen.",
      },
      {
        id: "pm-e-7",
        elemen: "Negosiasi Bisnis",
        deskripsi:
          "Memahami prinsip, strategi, tahapan, dan etika negosiasi bisnis untuk mencapai kesepakatan saling menguntungkan (win-win solution).",
      },
    ],
    faseF: [
      {
        id: "pm-f-1",
        elemen: "Riset Pasar & Strategi Digital Marketing",
        deskripsi:
          "Melakukan riset kata kunci, analisis kompetitor, penyusunan buyer persona, serta strategi SEO, SEM, dan iklan berbayar (Meta/Google Ads).",
      },
      {
        id: "pm-f-2",
        elemen: "Content Marketing & Pengelolaan Media Sosial",
        deskripsi:
          "Merancang kalender konten, copywriting persuasif, visual produk, dan optimasi engagement di berbagai platform media sosial.",
      },
      {
        id: "pm-f-3",
        elemen: "Operasional E-Commerce & Marketplace",
        deskripsi:
          "Mengelola katalog produk, penetapan harga, promosi toko, pemrosesan pesanan, layanan purnajual, dan reputasi toko online.",
      },
      {
        id: "pm-f-4",
        elemen: "Analitik Pemasaran & Pengelolaan Transaksi",
        deskripsi:
          "Mengevaluasi metrik konversi (CTR, ROAS, KPI penjualan), pencatatan transaksi keuangan ritel/digital, dan laporan kinerja pemasaran.",
      },
    ],
  },
];

export function getCapaianForSubject(
  subjectName: string,
  grade: GradeOption
): CapaianItem[] {
  const norm = subjectName.trim().toLowerCase();
  const fase = GRADE_LABELS[grade].fase;

  const matched = CURRICULUM_DB.find((item) =>
    item.keywords.some((kw) => norm.includes(kw) || kw.includes(norm))
  );

  if (!matched) {
    return [];
  }
  return fase === "E" ? matched.faseE : matched.faseF;
}
