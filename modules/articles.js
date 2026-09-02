/**
 * articles.js — News & Articles Portal Engine for "Giới thiệu về ngành"
 * Refined for high aesthetic standards, perfect typography, and flawless layout alignment.
 */

import { DB } from './db.js';

export const DEFAULT_ARTICLES = [
  {
    id: 'art_haccp_standard',
    title: 'Tiêu chuẩn HACCP trong sản xuất thực phẩm',
    category: 'An toàn thực phẩm',
    excerpt: 'HACCP giúp kiểm soát mối nguy và đảm bảo an toàn thực phẩm trong toàn bộ chuỗi sản xuất.',
    cover: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=900&auto=format&fit=crop',
    date: '26/05/2024',
    readTime: '6 phút đọc',
    views: 0,
    featured: true,
    content: `
      <p class="article-lead">Trong ngành công nghệ thực phẩm, việc đảm bảo an toàn vệ sinh và kiểm soát chất lượng là yếu tố sống còn. <strong>HACCP (Hazard Analysis and Critical Control Points)</strong> là hệ thống quản lý giúp doanh nghiệp nhận diện, đánh giá và kiểm soát mối nguy ở những điểm tới hạn trong quá trình sản xuất.</p>

      <h2 id="toc-1">1. HACCP là gì?</h2>
      <p>HACCP là viết tắt của <em>Hazard Analysis and Critical Control Points</em> – Phân tích mối nguy và điểm kiểm soát tới hạn. Đây là hệ thống quản lý phòng ngừa nhằm đảm bảo an toàn thực phẩm thông qua việc xác định và kiểm soát các mối nguy sinh học, hóa học và vật lý từ khâu tiếp nhận nguyên liệu đến thành phẩm tiêu dùng.</p>

      <h2 id="toc-2">2. 7 nguyên tắc của HACCP</h2>
      <p>Hệ thống HACCP được xây dựng trên 7 nguyên tắc nền tảng được công nhận quốc tế bởi Ủy ban Tiêu chuẩn Thực phẩm Codex:</p>
      <ol>
        <li><strong>Phân tích mối nguy:</strong> Xác định các mối nguy tiềm ẩn có thể gây hại cho người tiêu dùng trong toàn bộ quy trình chế biến.</li>
        <li><strong>Xác định điểm kiểm soát tới hạn (CCP):</strong> Xác định các điểm trong quy trình nơi việc kiểm soát là bắt buộc để ngăn chặn, loại bỏ hoặc giảm thiểu mối nguy xuống mức chấp nhận được.</li>
        <li><strong>Thiết lập ranh giới tới hạn:</strong> Thiết lập mức tối đa hoặc tối thiểu cho mỗi CCP để đảm bảo tính an toàn (ví dụ: nhiệt độ thanh trùng tối thiểu 85°C).</li>
        <li><strong>Thiết lập hệ thống giám sát:</strong> Giám sát liên tục hoặc định kỳ hoạt động của từng CCP để kiểm soát ranh giới tới hạn.</li>
        <li><strong>Thiết lập hành động khắc phục:</strong> Đưa ra biện pháp xử lý kịp thời khi kết quả giám sát cho thấy CCP bị vi phạm.</li>
        <li><strong>Thiết lập quy trình thẩm tra:</strong> Xác định hệ thống HACCP đang hoạt động đúng thiết kế và hiệu quả thông qua kiểm tra định kỳ và xét nghiệm mẫu.</li>
        <li><strong>Thiết lập thủ tục lưu trữ hồ sơ:</strong> Ghi chép và lưu trữ toàn bộ tài liệu, nhật ký giám sát và hành động khắc phục để phục vụ truy xuất nguồn gốc.</li>
      </ol>

      <h2 id="toc-3">3. Lợi ích khi áp dụng HACCP</h2>
      <p>Việc áp dụng HACCP mang lại cho các nhà máy chế biến thực phẩm những lợi ích to lớn:</p>
      <ul>
        <li>Tối ưu hóa chi phí bằng cách ngăn ngừa sản phẩm lỗi thay vì hủy bỏ sản phẩm sau khi sản xuất.</li>
        <li>Nâng cao uy tín thương hiệu và gia tăng niềm tin của người tiêu dùng trong nước và quốc tế.</li>
        <li>Tạo điều kiện thuận lợi cho xuất khẩu thực phẩm sang các thị trường khắt khe như EU, Mỹ, Nhật Bản.</li>
        <li>Đáp ứng đầy đủ các quy định pháp luật về an toàn vệ sinh thực phẩm của Bộ Y tế và Bộ NN&PTNT.</li>
      </ul>

      <h2 id="toc-4">4. Ứng dụng HACCP trong thực tế</h2>
      <p>Tại các nhà máy chế biến thực phẩm hiện đại (như nhà máy thủy hải sản, sữa, nước giải khát, đồ đóng hộp), CCP thường được đặt tại các công đoạn: tiếp nhận nguyên liệu tươi sống, công đoạn thanh trùng/tiệt nhiệt, hệ thống phát hiện kim loại/vật lạ, và kho bảo quản lạnh.</p>

      <h2 id="toc-5">5. Kết luận</h2>
      <p>Áp dụng HACCP không chỉ là yêu cầu bắt buộc mà còn là kim chỉ nam giúp các kỹ sư Công nghệ Thực phẩm xây dựng quy trình sản xuất chuẩn hóa, hướng tới sự phát triển bền vững của ngành công nghiệp thực phẩm Việt Nam.</p>
    `
  },
  {
    id: 'art_say_lanh',
    title: 'Ứng dụng công nghệ sấy lạnh trong bảo quản thực phẩm',
    category: 'Công nghệ chế biến',
    excerpt: 'Công nghệ sấy lạnh đang mở ra nhiều tiềm năng trong việc bảo quản thực phẩm, giữ nguyên giá trị dinh dưỡng và hương vị tự nhiên.',
    cover: 'https://placehold.co/900x600/e3f2fd/1976d2?text=Food+Technology',
    date: '28/05/2024',
    readTime: '5 phút đọc',
    views: 0,
    featured: true,
    content: `
      <p class="article-lead">Sấy lạnh (Freeze Drying / Heat Pump Drying) là một trong những công nghệ sấy tiên tiến nhất hiện nay, giúp bảo quản nông sản và thực phẩm tươi sống mà vẫn duy trì tối đa màu sắc, hương vị và hàm lượng vi chất dinh dưỡng.</p>

      <h2 id="toc-1">1. Nguyên lý hoạt động của công nghệ sấy lạnh</h2>
      <p>Sấy lạnh hoạt động ở nhiệt độ thấp từ 10°C - 50°C với không khí đã được tách ẩm hoàn toàn. Không khí khô làm hơi nước trong thực phẩm thoát ra ngoài nhanh chóng mà không làm ảnh hưởng đến cấu trúc tế bào hay biến tính vitamin.</p>

      <h2 id="toc-2">2. Ưu điểm vượt trội so với sấy nhiệt truyền thống</h2>
      <ul>
        <li>Giữ nguyên màu sắc tươi sáng tự nhiên của trái cây, rau củ và dược liệu.</li>
        <li>Hàm lượng Vitamin C, khoáng chất và chất chống oxy hóa được bảo toàn lên đến 95%.</li>
        <li>Sản phẩm sau sấy có độ giòn xốp tự nhiên, dễ tái hấp thu nước khi sử dụng.</li>
        <li>Tiết kiệm năng lượng hơn từ 25% - 40% so với phương pháp sấy điện trở thông thường.</li>
      </ul>

      <h2 id="toc-3">3. Ứng dụng trong ngành chế biến nông sản Việt Nam</h2>
      <p>Hiện nay công nghệ sấy lạnh được ứng dụng rộng rãi trong sấy xoài, thăng long, mảng cầu, các loại nấm linh chi, tổ yến và các sản phẩm chế biến từ trà dược liệu xuất khẩu.</p>
    `
  },
  {
    id: 'art_thuc_pham_chuc_nang',
    title: 'Xu hướng thực phẩm chức năng từ nguồn gốc tự nhiên',
    category: 'Dinh dưỡng',
    excerpt: 'Thực phẩm chức năng từ nguyên liệu tự nhiên ngày càng được ưa chuộng nhờ lợi ích sức khỏe và an toàn.',
    cover: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=900&auto=format&fit=crop',
    date: '24/05/2024',
    readTime: '4 phút đọc',
    views: 0,
    featured: true,
    content: `
      <p class="article-lead">Xu hướng chăm sóc sức khỏe chủ động thúc đẩy sự bùng nổ của ngành thực phẩm chức năng và dược thực phẩm tự nhiên trên toàn cầu.</p>
      <h2 id="toc-1">1. Sự chuyển dịch sang nguyên liệu thảo dược</h2>
      <p>Người tiêu dùng ngày càng ưu tiên các sản phẩm chiết xuất tự nhiên như mầm đậu nành, tinh chất nghệ curcumin, đông trùng hạ thảo và thực phẩm giàu omega-3 từ thực vật.</p>
      <h2 id="toc-2">2. Cơ hội phát triển cho sinh viên Ngành CNTP</h2>
      <p>Nắm vững kiến thức về Hóa học thực phẩm và Công nghệ sinh học giúp các kỹ sư trẻ tham gia vào nghiên cứu và phát triển sản phẩm (R&D) tại các tập đoàn thực phẩm hàng đầu.</p>
    `
  },
  {
    id: 'art_chuyen_doi_so',
    title: 'Chuyển đổi số trong ngành công nghệ thực phẩm',
    category: 'Xu hướng ngành',
    excerpt: 'Chuyển đổi số giúp tối ưu quy trình sản xuất, nâng cao hiệu quả và khả năng cạnh tranh.',
    cover: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=900&auto=format&fit=crop',
    date: '22/05/2024',
    readTime: '6 phút đọc',
    views: 0,
    featured: true,
    content: `
      <p class="article-lead">Cách mạng công nghiệp 4.0 đang thay đổi diện mạo ngành chế biến thực phẩm thông qua tự động hóa, IoT và Trí tuệ nhân tạo (AI).</p>
      <h2 id="toc-1">1. Nhà máy sản xuất thực phẩm thông minh</h2>
      <p>Cảm biến IoT kiểm soát liên tục nhiệt độ, độ ẩm và thông số vệ sinh sản xuất theo thời gian thực.</p>
      <h2 id="toc-2">2. Truy xuất nguồn gốc bằng Blockchain</h2>
      <p>Giúp người tiêu dùng dễ dàng quét mã QR truy xuất toàn bộ hành trình nông sản từ trang trại đến siêu thị.</p>
    `
  },
  {
    id: 'art_enzyme_che_bien',
    title: 'Ứng dụng enzyme trong chế biến thực phẩm',
    category: 'Công nghệ chế biến',
    excerpt: 'Enzyme đóng vai trò quan trọng trong việc cải thiện chất lượng, hương vị và giá trị dinh dưỡng của thực phẩm.',
    cover: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=900&auto=format&fit=crop',
    date: '20/05/2024',
    readTime: '4 phút đọc',
    views: 0,
    featured: false,
    content: `
      <p class="article-lead">Enzyme (men sinh học) là chất xúc tác sinh học không thể thiếu trong công nghiệp tinh bột, bia rượu, sữa và chế biến nước trái cây.</p>
      <h2 id="toc-1">1. Các nhóm enzyme phổ biến</h2>
      <p>Amylase thủy phân tinh bột, Pectinase làm trong nước quả, Protease làm mềm thịt và phân giải protein sữa trong sản xuất phô mai.</p>
    `
  },
  {
    id: 'art_protein_thuc_vat',
    title: 'Protein thực vật – Nguồn dinh dưỡng bền vững',
    category: 'Dinh dưỡng',
    excerpt: 'Protein thực vật đang trở thành lựa chọn hàng đầu cho sức khỏe và môi trường.',
    cover: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=900&auto=format&fit=crop',
    date: '18/05/2024',
    readTime: '3 phút đọc',
    views: 0,
    featured: false,
    content: `
      <p class="article-lead">Sự gia tăng nhu cầu về chế độ ăn lành mạnh và giảm phát thải carbon đang biến protein thực vật thành trung tâm của ngành thực phẩm tương lai.</p>
      <h2 id="toc-1">1. Đột phá công nghệ thịt thực vật</h2>
      <p>Ứng dụng công nghệ đùn ép nhiệt giúp tái tạo cấu trúc sợi cơ của thịt từ đạm đậu nành và hạt đậu Hà Lan.</p>
    `
  },
  {
    id: 'art_an_toan_chuoi_cung_ung',
    title: 'An toàn thực phẩm trong chuỗi cung ứng nông sản',
    category: 'An toàn thực phẩm',
    excerpt: 'Xây dựng quy trình kiểm soát sinh học và hóa học từ nông trại đến bàn ăn.',
    cover: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=900&auto=format&fit=crop',
    date: '15/05/2024',
    readTime: '7 phút đọc',
    views: 0,
    featured: false,
    content: `
      <p class="article-lead">Quản lý chuỗi cung ứng khép kín từ sản xuất, vận chuyển lạnh (Cold Chain) đến tiêu thụ giúp giảm tỉ lệ tổn thất sau thu hoạch.</p>
      <h2 id="toc-1">1. Kiểm soát dư lượng thuốc bảo vệ thực vật</h2>
      <p>Áp dụng tiêu chuẩn VietGAP và GlobalGAP trong canh tác nhằm đáp ứng quy chuẩn kiểm định nghiêm ngặt.</p>
    `
  }
];

export const CATEGORIES = [
  'Tất cả',
  'Công nghệ chế biến',
  'An toàn thực phẩm',
  'Dinh dưỡng',
  'Xu hướng ngành',
  'Nghiên cứu khoa học'
];

export const ArticlesModule = {
  currentCategory: 'Tất cả',
  currentSort: 'newest',
  searchQuery: '',
  activeArticleId: null,

  getArticlesData() {
    try {
      const stored = DB.getArticles();
      
      // If we have stored data (even empty array after deletions), use it
      if (stored !== null && stored !== undefined) {
        // Map and ensure views property exists
        const articles = Array.isArray(stored) ? stored : [];
        return articles.map(s => {
          // Ensure views property exists
          if (s.views === undefined) s.views = 0;
          return s;
        });
      }
      
      // First time initialization: load defaults
      const hasInitialized = localStorage.getItem('qlcl_articles_initialized');
      if (!hasInitialized) {
        localStorage.setItem('qlcl_articles_initialized', 'true');
        DEFAULT_ARTICLES.forEach(art => DB.saveArticle(art, true));
        return DEFAULT_ARTICLES;
      }
      
      return [];
    } catch (e) {
      console.warn('Lỗi đọc bài viết từ DB:', e);
      return [];
    }
  },

  renderArticlesView() {
    const container = document.getElementById('page-about');
    if (!container) return;

    if (this.activeArticleId) {
      this.renderDetailView(container);
    } else {
      this.renderListingView(container);
    }
  },

  renderListingView(container) {
    const allArticles = this.getArticlesData();

    // Filter by Category
    let filtered = allArticles.filter(a => {
      if (this.currentCategory !== 'Tất cả' && a.category !== this.currentCategory) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return (a.title || '').toLowerCase().includes(q) ||
               (a.excerpt || '').toLowerCase().includes(q) ||
               (a.category || '').toLowerCase().includes(q);
      }
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (this.currentSort === 'views') {
        return (b.views || 0) - (a.views || 0);
      }
      return new Date(b.date.split('/').reverse().join('-') || 0) - new Date(a.date.split('/').reverse().join('-') || 0);
    });

    // Main Hero Article - use first featured or first available article
    let heroArticle = null;
    if (this.searchQuery || this.currentCategory !== 'Tất cả') {
      heroArticle = filtered[0] || null;
    } else {
      // Try to find a featured article first
      heroArticle = allArticles.find(a => a.featured) || allArticles[0] || null;
    }

    // Subfeatured 3 Cards - get next 3 articles after hero (only if they exist)
    let subFeatured = [];
    if (allArticles.length > 1) {
      const remainingArticles = allArticles.filter(a => a.id !== heroArticle?.id);
      subFeatured = remainingArticles.slice(0, 3);
    }

    // Compute Category Stats for Sidebar
    const catCounts = {};
    CATEGORIES.filter(c => c !== 'Tất cả').forEach(c => {
      catCounts[c] = allArticles.filter(a => a.category === c).length;
    });

    // Top Viewed Articles for Sidebar (Rank 1..5)
    const topViewed = [...allArticles]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 5);

    container.innerHTML = `
      <div class="articles-portal-container">
        <!-- ── News Hero ── -->
        <div class="articles-header-section">
          <div class="articles-news-hero">
            <div class="articles-hero-copy">
              <div class="articles-hero-eyebrow"><i class="fa-solid fa-newspaper"></i> FTECA 24 · CỔNG THÔNG TIN</div>
              <h1 class="articles-portal-title">Tin tức <span>mới nhất</span></h1>
              <p class="articles-portal-desc">Cập nhật thông tin, bài viết và kiến thức mới dành cho sinh viên Công nghệ Thực phẩm.</p>
              <div class="articles-hero-note"><i class="fa-solid fa-sparkles"></i> Nội dung mới được cập nhật thường xuyên</div>
            </div>
            <div class="articles-hero-art" aria-label="Minh họa sinh viên FTECA">
              <div class="articles-hero-decor" aria-hidden="true">
                <div class="articles-art-orb articles-art-orb-one"></div>
                <div class="articles-art-orb articles-art-orb-two"></div>
                <div class="articles-art-dots"></div>
              </div>
              <img src="main1.webp" alt="Sinh viên FTECA chụp ảnh" class="articles-hero-person-image">
            </div>
          </div>

          <!-- ── Filter Category Chips Bar + Sort Dropdown ── -->
          <div class="articles-filter-bar">
            <div class="articles-chips-scroll custom-scroll">
              ${CATEGORIES.map(cat => `
                <button class="category-chip ${this.currentCategory === cat ? 'active' : ''}" onclick="ArticlesModule.setCategory('${cat}')">
                  ${cat}
                </button>
              `).join('')}
            </div>

            <div class="articles-sort-wrap">
              <i class="fa-solid fa-sliders text-xs text-muted"></i>
              <select class="articles-sort-select" onchange="ArticlesModule.setSort(this.value)">
                <option value="newest" ${this.currentSort === 'newest' ? 'selected' : ''}>Mới nhất</option>
                <option value="views" ${this.currentSort === 'views' ? 'selected' : ''}>Lượt xem nhiều</option>
              </select>
            </div>
          </div>
        </div>

        <!-- ── Main Portal Grid (Left Content 1fr / Right Sidebar 340px) ── -->
        <div class="articles-main-grid margin-top-20">
          
          <!-- LEFT COLUMN: Featured Hero Grid + Latest Articles List -->
          <div class="articles-left-col">
            
            <!-- Featured Hero Grid (Image 2 exact style) -->
            ${!this.searchQuery && this.currentCategory === 'Tất cả' && heroArticle && subFeatured.length > 0 ? `
              <div class="articles-featured-grid">
                <!-- Large Hero Featured Card (Left) -->
                <div class="article-hero-card card-hover-lift" onclick="ArticlesModule.openDetail('${heroArticle.id}')">
                  <div class="hero-img-wrap">
                    <img src="${heroArticle.cover}" alt="${heroArticle.title}" class="hero-card-img" referrerpolicy="no-referrer" onerror="this.src='https://placehold.co/800x600/e3f2fd/1976d2?text=No+Image'">
                  </div>
                  <div class="hero-card-body">
                    <span class="article-cat-badge badge-green">${heroArticle.category}</span>
                    <h2 class="hero-card-title">${heroArticle.title}</h2>
                    <p class="hero-card-excerpt">${heroArticle.excerpt}</p>
                    <div class="article-meta-row">
                      <span><i class="fa-regular fa-calendar"></i> ${heroArticle.date || '28/05/2024'}</span>
                      <span><i class="fa-regular fa-eye"></i> ${heroArticle.views || 0} lượt đọc</span>
                      <span><i class="fa-regular fa-clock"></i> ${heroArticle.readTime || '5 phút đọc'}</span>
                    </div>
                  </div>
                </div>

                <!-- Sub-featured 3 Cards Stack (Right) -->
                <div class="article-subfeatured-stack">
                  ${subFeatured.map(item => `
                    <div class="article-subcard card-hover-lift" onclick="ArticlesModule.openDetail('${item.id}')">
                      <img src="${item.cover}" alt="${item.title}" class="subcard-img" referrerpolicy="no-referrer" onerror="this.src='https://images.unsplash.com/photo-1579154204601-01588f351e67?w=400&auto=format&fit=crop'">
                      <div class="subcard-body">
                        <span class="article-cat-badge badge-subtle-green">${item.category}</span>
                        <h3 class="subcard-title">${item.title}</h3>
                        <div class="article-meta-row text-xs">
                          <span><i class="fa-regular fa-calendar"></i> ${item.date}</span>
                          <span class="nowrap"><i class="fa-regular fa-eye"></i> ${item.views || 0} lượt đọc</span>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Latest Articles Section Title -->
            <div class="articles-section-header margin-top-24">
              <h3><i class="fa-solid fa-layer-group text-primary"></i> Bài viết mới nhất</h3>
            </div>

            <!-- Articles List (Horizontal Cards) -->
            <div class="articles-horizontal-list space-y-3 margin-top-12">
              ${filtered.length === 0 ? `
                <div class="card text-center py-8">
                  <div style="font-size:32px;margin-bottom:8px;">🔍</div>
                  <div class="font-semibold text-secondary">Không tìm thấy bài viết nào phù hợp</div>
                  <p class="text-xs text-muted mt-1">Thử chọn danh mục khác hoặc chọn Tất cả.</p>
                </div>
              ` : filtered.map(art => `
                <div class="article-horizontal-card card-hover-lift" onclick="ArticlesModule.openDetail('${art.id}')">
                  <img src="${art.cover}" alt="${art.title}" class="h-card-img" referrerpolicy="no-referrer" onerror="this.src='https://placehold.co/400x300/e3f2fd/1976d2?text=No+Image'">
                  <div class="h-card-body">
                    <div class="flex justify-between items-center gap-2">
                      <span class="article-cat-badge badge-subtle-green">${art.category}</span>
                    </div>
                    <h3 class="h-card-title">${art.title}</h3>
                    <p class="h-card-excerpt">${art.excerpt}</p>
                    <div class="article-meta-row text-xs">
                      <span><i class="fa-regular fa-calendar"></i> ${art.date}</span>
                      <span><i class="fa-regular fa-clock"></i> ${art.readTime || '4 phút đọc'}</span>
                      <span><i class="fa-regular fa-eye"></i> ${art.views || 0} lượt đọc</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>

          </div>

          <!-- RIGHT COLUMN: Sidebar (🔥 Chủ đề nổi bật + 📈 Đọc nhiều tuần này) -->
          <div class="articles-right-sidebar">
            
            <!-- Box 1: 🔥 Chủ đề nổi bật -->
            <div class="articles-sidebar-box card">
              <h3 class="sidebar-box-title">
                <i class="fa-solid fa-fire text-amber"></i> Chủ đề nổi bật
              </h3>
              <div class="sidebar-categories-list margin-top-12">
                ${CATEGORIES.filter(c => c !== 'Tất cả').map(c => `
                  <div class="sidebar-cat-item ${this.currentCategory === c ? 'active' : ''}" onclick="ArticlesModule.setCategory('${c}')">
                    <span class="cat-item-name">${c}</span>
                    <span class="cat-item-badge">${catCounts[c] || 0} bài viết</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Box 2: 📈 Đọc nhiều tuần này -->
            <div class="articles-sidebar-box card margin-top-20">
              <h3 class="sidebar-box-title">
                <i class="fa-solid fa-chart-line text-emerald"></i> Đọc nhiều tuần này
              </h3>
              <div class="sidebar-ranking-list margin-top-12">
                ${topViewed.map((art, idx) => `
                  <div class="sidebar-rank-item" onclick="ArticlesModule.openDetail('${art.id}')">
                    <span class="rank-num rank-num-${idx + 1}">${idx + 1}</span>
                    <div class="rank-info">
                      <div class="rank-title">${art.title}</div>
                      <div class="rank-views"><i class="fa-regular fa-eye"></i> ${art.views || 800} lượt đọc</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  },

  renderDetailView(container) {
    const allArticles = this.getArticlesData();
    const article = allArticles.find(a => a.id === this.activeArticleId) || allArticles[0] || DEFAULT_ARTICLES[0];

    // Increment view count in memory/DB
    article.views = (article.views || 0) + 1;

    // Related Articles
    const related = allArticles
      .filter(a => a.id !== article.id)
      .slice(0, 4);

    container.innerHTML = `
      <div class="article-reader-container">
        <!-- ── Top Back Button ── -->
        <div class="article-reader-topbar margin-bottom-16">
          <button class="btn btn-secondary btn-sm article-back-btn" onclick="ArticlesModule.closeDetail()">
            <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách
          </button>
        </div>

        <!-- ── Reader Grid (Left Content / Right Sidebar) ── -->
        <div class="article-reader-grid">
          
          <!-- LEFT MAIN ARTICLE CONTENT COLUMN -->
          <div class="article-reader-main card">
            <div class="reader-header">
              <span class="article-cat-badge badge-green">${article.category}</span>
              <h1 class="reader-title">${article.title}</h1>
              <p class="reader-excerpt">${article.excerpt}</p>
              <div class="article-meta-row reader-meta">
                <span><i class="fa-regular fa-calendar"></i> ${article.date || '26/05/2024'}</span>
                <span><i class="fa-regular fa-eye"></i> ${article.views} lượt đọc</span>
                <span><i class="fa-regular fa-clock"></i> ${article.readTime || '6 phút đọc'}</span>
              </div>
            </div>

            <!-- Main Cover Image -->
            <div class="reader-cover-wrap margin-top-16">
              <img src="${article.cover}" alt="${article.title}" class="reader-cover-img" referrerpolicy="no-referrer" onerror="this.src='https://images.unsplash.com/photo-1579154204601-01588f351e67?w=900&auto=format&fit=crop'">
            </div>

            <!-- Article Body Content -->
            <div class="reader-article-body article-prose margin-top-24" id="reader-body-content">
              ${article.content || '<p>Nội dung đang được cập nhật...</p>'}
            </div>
          </div>

          <!-- RIGHT SIDEBAR (Mục lục bài viết + Bài viết liên quan) -->
          <div class="article-reader-sidebar">
            
            <!-- Box 1: 📌 Mục lục bài viết (Table of Contents) -->
            <div class="articles-sidebar-box card toc-sticky-box">
              <h3 class="sidebar-box-title">
                <i class="fa-solid fa-list-ul text-primary"></i> Mục lục bài viết
              </h3>
              <div id="article-toc-container" class="toc-list margin-top-12">
                <!-- Populated dynamically via DOM -->
              </div>
            </div>

            <!-- Box 2: 📰 Bài viết liên quan -->
            <div class="articles-sidebar-box card margin-top-20">
              <h3 class="sidebar-box-title">
                <i class="fa-solid fa-newspaper text-emerald"></i> Bài viết liên quan
              </h3>
              <div class="related-articles-list margin-top-12 space-y-3">
                ${related.map(item => `
                  <div class="related-card" onclick="ArticlesModule.openDetail('${item.id}')">
                    <img src="${item.cover}" alt="${item.title}" class="related-img" referrerpolicy="no-referrer" onerror="this.src='https://placehold.co/300x200/e3f2fd/1976d2?text=No+Image'">
                    <div class="related-info">
                      <div class="related-title">${item.title}</div>
                      <div class="related-meta"><i class="fa-regular fa-clock"></i> ${item.readTime || '5 phút đọc'}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

          </div>

        </div>
      </div>
    `;

    // Auto-generate TOC links from H2 tags inside reader body
    setTimeout(() => {
      this.generateTocFromDOM();
    }, 50);
  },

  generateTocFromDOM() {
    const bodyContent = document.getElementById('reader-body-content');
    const tocContainer = document.getElementById('article-toc-container');
    if (!bodyContent || !tocContainer) return;

    const headings = bodyContent.querySelectorAll('h2, h3');
    if (headings.length === 0) {
      tocContainer.innerHTML = '<div class="text-xs text-muted">Không có mục lục</div>';
      return;
    }

    tocContainer.innerHTML = Array.from(headings).map((h, idx) => {
      const id = h.id || `toc-heading-${idx + 1}`;
      h.id = id;
      const titleText = h.textContent.trim();
      const isSub = h.tagName.toLowerCase() === 'h3';
      return `
        <a href="#${id}" class="toc-item ${idx === 0 ? 'active' : ''} ${isSub ? 'toc-sub' : ''}" onclick="ArticlesModule.scrollToToc('${id}', event)">
          ${titleText}
        </a>
      `;
    }).join('');
  },

  scrollToToc(elementId, event) {
    if (event) event.preventDefault();
    const target = document.getElementById(elementId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Highlight active TOC item
      document.querySelectorAll('.toc-item').forEach(item => item.classList.remove('active'));
      const activeLink = document.querySelector(`.toc-item[href="#${elementId}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  },

  setCategory(cat) {
    this.currentCategory = cat;
    this.activeArticleId = null;
    this.renderArticlesView();
  },

  setSort(sortType) {
    this.currentSort = sortType;
    this.renderArticlesView();
  },

  openDetail(articleId) {
    this.activeArticleId = articleId;

    // Real view counter increment & save to persistent DB
    const allArticles = this.getArticlesData();
    const article = allArticles.find(a => a.id === articleId);
    if (article) {
      article.views = (article.views || 0) + 1;
      DB.saveArticle(article);
    }

    this.renderArticlesView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  closeDetail() {
    this.activeArticleId = null;
    this.renderArticlesView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

window.ArticlesModule = ArticlesModule;
