/**
 * ACG游戏姬 - 主题切换 & 数据渲染
 */

// ========== 数据加载 ==========
let siteData = null;

async function loadData() {
    try {
        const cacheBuster = '?v=' + Date.now();
        const res = await fetch('data/posts-index.json' + cacheBuster);
        siteData = await res.json();
        renderAll();
    } catch (err) {
        console.error('数据加载失败:', err);
        document.getElementById('posts-container').innerHTML =
            '<div class="text-center py-5"><p style="color:var(--bs-gray-600)">数据加载失败，请检查 data/posts.json 文件</p></div>';
    }
}

function renderAll() {
    if (!siteData) return;
    renderPosts();
    renderTags();
    renderWeeklyRank();
    renderRandomPosts();
    renderFooter();
}

// ========== 渲染随机推荐（文章页侧边栏,容器不存在时静默跳过) ==========
function renderRandomPosts() {
    const container = document.getElementById('random-posts-container');
    if (!container) return;
    if (!siteData.posts || siteData.posts.length === 0) return;
    const shuffled = siteData.posts.slice().sort(() => Math.random() - 0.5);
    const top = shuffled.slice(0, 5);
    container.innerHTML = top.map(p => {
        let coverImg = p.image || '';
        if (!coverImg && p.content) {
            const m = p.content.match(/src="([^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
            if (m) coverImg = m[1];
        }
        const imgUrl = coverImg && (coverImg.startsWith('http') && !coverImg.includes(window.location.hostname))
            ? '/img?url=' + encodeURIComponent(coverImg)
            : coverImg;
        const imgHtml = imgUrl
            ? `<img src="${imgUrl}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">`
            : '';
        return `
        <article class="widget-post">
            <div class="info">
                <a href="${p.link || '/article.html?id=' + p.id}" class="thumb">
                    <div class="thumb-placeholder" style="background:${p.gradient || 'var(--bg-elevated)'};">${imgHtml}</div>
                </a>
                <h4 class="post-title-widget"><a href="${p.link || '/article.html?id=' + p.id}">${p.title}</a></h4>
                <time>${p.date}</time>
            </div>
        </article>`;
    }).join('');
}

function renderFooter() {
    const el = document.getElementById('footer-text');
    if (el && siteData.site && siteData.site.footer) {
        el.textContent = siteData.site.footer;
    }
    // 「本站已稳定运行了 X 天」：每日零点重置，从 1 天开始按 24 小时累加
    const daysEl = document.getElementById('running-days');
    if (daysEl) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const base = startOfDay.getTime() - 86400000;
        const diff = Math.max(1, Math.floor((Date.now() - base) / 86400000));
        daysEl.textContent = diff;
    }
    // banner 标题渐变加载态
    const main = document.getElementById('site-main');
    if (main) main.classList.add('loaded');
    // banner 图：原站靠 JS 监听 img onload 才加 .loaded 显示
    const bannerImg = document.getElementById('banner-img');
    if (bannerImg) {
        const bannerImgWrap = bannerImg.closest('.boxmoe_header_banner_img');
        const showBanner = () => { if (bannerImgWrap) bannerImgWrap.classList.add('loaded'); };
        if (bannerImg.complete && bannerImg.naturalWidth > 0) {
            showBanner();
        } else {
            bannerImg.addEventListener('load', showBanner);
            bannerImg.addEventListener('error', showBanner); // 图挂了也显示兜底渐变底
            // 4 秒保险丝：防止 onload 不触发导致图永远不出现
            setTimeout(showBanner, 4000);
        }
    }
}

// ========== 渲染文章列表 ==========
const PER_PAGE = 10;
let currentPage = 1;

function renderPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const activeTag = urlParams.get('tag') || '';
    const searchQuery = urlParams.get('q') || '';
    currentPage = parseInt(urlParams.get('page')) || 1;

    // 按标签筛选
    let filteredPosts = siteData.posts;
    // 首页永远最新:按日期倒序,同日按 id 倒序(新文章在前)
    filteredPosts = filteredPosts.slice().sort((a, b) => {
      const da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? 1 : -1;
      return (b.id || 0) - (a.id || 0);
    });
    if (activeTag) {
        const tagLower = activeTag.toLowerCase();
        filteredPosts = siteData.posts.filter(post => {
            if (post.tags && post.tags.some(t => t.toLowerCase() === tagLower)) return true;
            if (post.category && post.category.toLowerCase() === tagLower) return true;
            if (post.title && post.title.toLowerCase().includes(tagLower)) return true;
            if (post.description && post.description.toLowerCase().includes(tagLower)) return true;
            return false;
        });
    }

    // 按关键词搜索
    if (searchQuery) {
        const qLower = searchQuery.toLowerCase();
        filteredPosts = filteredPosts.filter(post => {
            if (post.title && post.title.toLowerCase().includes(qLower)) return true;
            if (post.description && post.description.toLowerCase().includes(qLower)) return true;
            if (post.tags && post.tags.some(t => t.toLowerCase().includes(qLower))) return true;
            if (post.category && post.category.toLowerCase().includes(qLower)) return true;
            return false;
        });
    }

    const totalPages = Math.ceil(filteredPosts.length / PER_PAGE);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * PER_PAGE;
    const end = start + PER_PAGE;
    const pagePosts = filteredPosts.slice(start, end);

    // 构建分页额外参数（保留 tag 和 q）
    let extraParams = '';
    if (activeTag) extraParams += '&tag=' + encodeURIComponent(activeTag);
    if (searchQuery) extraParams += '&q=' + encodeURIComponent(searchQuery);

    // 筛选/搜索提示条
    let filterBar = '';
    if (activeTag) {
        filterBar = `
        <div class="blog-border" style="padding:0.6rem 1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
            <span style="font-size:0.85rem;">
                <i class="fa fa-tag" style="color:var(--accent);"></i>
                <strong>${activeTag}</strong>
                <span class="text-muted"> — 找到 ${filteredPosts.length} 篇</span>
            </span>
            <a href="${window.location.pathname}" class="btn btn-sm btn-outline-accent py-0 px-2 ms-auto">
                <i class="fa fa-times"></i> 清除筛选
            </a>
        </div>`;
    } else if (searchQuery) {
        filterBar = `
        <div class="blog-border" style="padding:0.6rem 1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
            <span style="font-size:0.85rem;">
                <i class="fa fa-search" style="color:var(--accent);"></i>
                搜索 "<strong>${searchQuery}</strong>"
                <span class="text-muted"> — 找到 ${filteredPosts.length} 篇</span>
            </span>
            <a href="${window.location.pathname}" class="btn btn-sm btn-outline-accent py-0 px-2 ms-auto">
                <i class="fa fa-times"></i> 清除搜索
            </a>
        </div>`;
    }

    const html = pagePosts.map(post => {
        let coverImg = post.image || '';
        if (!coverImg && post.content) {
            const m = post.content.match(/src="([^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
            if (m) coverImg = m[1];
        }
        const imgUrl = coverImg && (coverImg.startsWith('http') && !coverImg.includes(window.location.hostname))
            ? '/img?url=' + encodeURIComponent(coverImg)
            : coverImg;
        const imgHtml = imgUrl
            ? `<img src="${imgUrl}" alt="${post.title}" class="img-fluid rounded-3" onerror="this.style.display='none'">`
            : `<div class="img-placeholder" style="background:${post.gradient};">
                <span class="placeholder-icon"><i class="fa ${post.icon}"></i></span>
               </div>`;
        return `
        <article class="post-list list-one row blog-border">
            <div class="post-list-img">
                <figure class="mb-4 mb-lg-0 zoom-img">
                    <a href="${post.link}">${imgHtml}</a>
                </figure>
            </div>
            <div class="post-list-content">
                <div class="category">
                    <div class="tags">
                        <a href="?tag=${encodeURIComponent(post.category)}" class="tag-link"><i class="tagfa fa fa-dot-circle-o"></i>${post.category}</a>
                    </div>
                </div>
                <div class="mt-2 mb-2">
                    <h3 class="post-title h4">
                        <a href="${post.link}" class="text-reset">${post.title}</a>
                    </h3>
                    <p class="post-content">${post.description}</p>
                </div>
                <div class="post-meta align-items-center">
                    <div class="post-list-avatar">
                        <div class="avatar-placeholder">${post.authorAvatar || 'CL'}</div>
                    </div>
                    <div class="post-meta-info">
                        <div class="post-meta-stats">
                            <span class="list-post-view"><i class="fa fa-street-view"></i>${post.views ?? 0}</span>
                            <span class="list-post-comment"><i class="fa fa-comments-o"></i>${post.comments ?? 0}</span>
                        </div>
                        <span class="list-post-author">
                            <i class="fa fa-at"></i>${post.author || 'CL'}
                            <span class="dot"></span>${post.date}
                        </span>
                    </div>
                </div>
            </div>
        </article>`;
    }).join('');

    // 分页
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `
        <nav class="pagination-nav" aria-label="Page navigation">
            <ul class="pagination justify-content-center">
                <li class="page-item ${currentPage <= 1 ? 'disabled' : ''}">
                    <a class="page-link" href="?page=${currentPage - 1}${extraParams}"><i class="fa fa-angle-left"></i></a>
                </li>`;

        const maxVisible = 5;
        let pageStart = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let pageEnd = Math.min(totalPages, pageStart + maxVisible - 1);
        if (pageEnd - pageStart + 1 < maxVisible) {
            pageStart = Math.max(1, pageEnd - maxVisible + 1);
        }

        if (pageStart > 1) {
            paginationHtml += `<li class="page-item"><a class="page-link" href="?page=1${extraParams}">1</a></li>`;
            if (pageStart > 2) paginationHtml += `<li class="page-item disabled"><a class="page-link">...</a></li>`;
        }
        for (let p = pageStart; p <= pageEnd; p++) {
            paginationHtml += `<li class="page-item ${p === currentPage ? 'active' : ''}">
                <a class="page-link" href="?page=${p}${extraParams}">${p}</a></li>`;
        }
        if (pageEnd < totalPages) {
            if (pageEnd < totalPages - 1) paginationHtml += `<li class="page-item disabled"><a class="page-link">...</a></li>`;
            paginationHtml += `<li class="page-item"><a class="page-link" href="?page=${totalPages}${extraParams}">${totalPages}</a></li>`;
        }

        paginationHtml += `
                <li class="page-item ${currentPage >= totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="?page=${currentPage + 1}${extraParams}"><i class="fa fa-angle-right"></i></a>
                </li>
            </ul>
        </nav>`;
    }

    container.innerHTML = filterBar + html + paginationHtml;
}

// ========== 渲染标签云 ==========
function renderTags() {
    const container = document.getElementById('tags-container');
    const urlParams = new URLSearchParams(window.location.search);
    const activeTag = urlParams.get('tag') || '';
    container.innerHTML = siteData.tags.map(tag => {
        const isActive = activeTag && tag.toLowerCase() === activeTag.toLowerCase();
        return `<a href="?tag=${encodeURIComponent(tag)}" class="tag-cloud${isActive ? ' tag-cloud-active' : ''}"><i class="tagfa fa fa-dot-circle-o"></i>${tag}</a>`;
    }).join('');
}

// ========== 渲染周榜（对齐原站 widget-latest） ==========
function renderWeeklyRank() {
    const container = document.getElementById('weekly-rank-container');
    if (!container) return;
    // 原站周榜 = 近 7 天阅读量 Top5
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const weekPosts = siteData.posts.filter(p => {
        const t = p.date ? new Date(p.date).getTime() : 0;
        return t >= weekAgo;
    });
    const top = weekPosts.length
        ? weekPosts.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5)
        : (siteData.randomPosts || []).slice(0, 5);

    container.innerHTML = top.map(p => {
        let coverImg = p.image || '';
        if (!coverImg && p.content) {
            const m = p.content.match(/src="([^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
            if (m) coverImg = m[1];
        }
        const imgUrl = coverImg && (coverImg.startsWith('http') && !coverImg.includes(window.location.hostname))
            ? '/img?url=' + encodeURIComponent(coverImg)
            : coverImg;
        const imgHtml = imgUrl
            ? `<img src="${imgUrl}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" loading="lazy">`
            : '';
        return `
        <article class="widget-post">
            <div class="info">
                <a href="${p.link}" class="thumb">
                    <div class="thumb-placeholder" style="background:${p.gradient || 'var(--bg-elevated)'};">${imgHtml}</div>
                </a>
                <h4 class="post-title-widget"><a href="${p.link}">${p.title}</a></h4>
                <time>${p.date}</time>
            </div>
        </article>`;
    }).join('');
}

// ========== 主题切换 ==========
document.addEventListener('DOMContentLoaded', function () {

    function getPreferredTheme() {
        const stored = localStorage.getItem('theme');
        if (stored) return stored;
        const htmlTheme = document.documentElement.getAttribute('data-bs-theme');
        if (htmlTheme) return htmlTheme;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    }

    function setTheme(theme) {
        if (theme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-bs-theme', theme);
        }
        localStorage.setItem('theme', theme);
        updateActiveTheme(theme);
    }

    function updateActiveTheme(theme) {
        document.querySelectorAll('.bs-theme .dropdown-item, .lighting li').forEach(el => {
            const val = el.getAttribute('data-bs-theme-value');
            if (val === theme) {
                el.classList.add('active');
                el.setAttribute('aria-pressed', 'true');
            } else {
                el.classList.remove('active');
                el.setAttribute('aria-pressed', 'false');
            }
        });
        document.querySelectorAll('.float-btn.bd-theme').forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) {
                if (theme === 'light') icon.className = 'fa fa-sun-o';
                else if (theme === 'dark') icon.className = 'fa fa-moon-o';
                else icon.className = 'fa fa-adjust';
            }
        });
    }

    const currentTheme = getPreferredTheme();
    setTheme(currentTheme);

    document.querySelectorAll('.bs-theme .dropdown-item').forEach(item => {
        item.addEventListener('click', function () {
            setTheme(this.getAttribute('data-bs-theme-value'));
        });
    });

    document.querySelectorAll('.lighting li').forEach(item => {
        item.addEventListener('click', function () {
            setTheme(this.getAttribute('data-bs-theme-value'));
        });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const stored = localStorage.getItem('theme');
        if (stored === 'auto' || !stored) setTheme('auto');
    });

    // ========== 导航栏滚动效果 ==========
    const navbar = document.querySelector('.boxmoe_header .navbar');
    if (navbar) {
        window.addEventListener('scroll', function () {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // ========== 关闭移动端侧栏 ==========
    document.querySelectorAll('.offcanvas-nav .nav-link').forEach(link => {
        link.addEventListener('click', function () {
            const offcanvas = document.querySelector('.offcanvas-nav');
            if (offcanvas) {
                const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
                if (bsOffcanvas) bsOffcanvas.hide();
            }
        });
    });

    // ========== 搜索表单提交 ==========
    document.querySelectorAll('.search-form, .mobile-search-form').forEach(form => {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const input = this.querySelector('input[type="search"], .search-input, .mobile-search-input, .form-control');
            if (!input) return;
            const q = input.value.trim();
            if (q) {
                window.location.href = '/?q=' + encodeURIComponent(q);
            }
        });
    });

    // ========== 加载数据 ==========
    loadData();

    // ========== 返回顶部（原站 lolijump） ==========
    const backtop = document.getElementById('lolijump');
    if (backtop) {
        backtop.addEventListener('click', function (e) {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ========== 侧边栏 offcanvas 关闭后恢复 ==========
    const sideBar = document.getElementById('blog-sidebar');
    if (sideBar) {
        sideBar.addEventListener('click', function (e) {
            if (e.target === this || e.target.classList.contains('btn-close')) {
                // 点面板空白或关闭按钮时，移动端收起
                if (window.innerWidth < 992) {
                    bootstrap.Offcanvas.getOrCreateInstance(this).hide();
                }
            }
        });
    }
});
