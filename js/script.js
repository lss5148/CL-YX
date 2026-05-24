/**
 * ACG游戏姬 - 主题切换 & 数据渲染
 */

// ========== 数据加载 ==========
let siteData = null;

async function loadData() {
    try {
        const res = await fetch('data/posts.json');
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
    renderComments();
    renderRandomPosts();
}

// ========== 渲染文章列表 ==========
function renderPosts() {
    const container = document.getElementById('posts-container');
    const html = siteData.posts.map(post => `
        <article class="post-list list-one row blog-border">
            <div class="post-list-img">
                <figure class="mb-4 mb-lg-0 zoom-img">
                    <a href="${post.link}">
                        <div class="img-placeholder" style="background:${post.gradient};">
                            <span class="placeholder-icon"><i class="fa ${post.icon}"></i></span>
                        </div>
                    </a>
                </figure>
            </div>
            <div class="post-list-content">
                <div class="category">
                    <div class="tags">
                        <a href="#" class="tag-link"><i class="tagfa fa fa-dot-circle-o"></i>${post.category}</a>
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
                        <div class="avatar-placeholder">${post.authorAvatar}</div>
                    </div>
                    <div class="post-meta-info">
                        <div class="post-meta-stats">
                            <span class="list-post-view"><i class="fa fa-street-view"></i>${post.views}</span>
                            <span class="list-post-comment"><i class="fa fa-comments-o"></i>${post.comments}</span>
                        </div>
                        <span class="list-post-author">
                            <i class="fa fa-at"></i>${post.author}
                            <span class="dot"></span>${post.date}
                        </span>
                    </div>
                </div>
            </div>
        </article>
    `).join('');

    // 分页
    const pg = siteData.pagination;
    let paginationHtml = `
        <nav class="pagination-nav" aria-label="Page navigation">
            <ul class="pagination justify-content-center">
                <li class="page-item ${pg.prevDisabled ? 'disabled' : ''}">
                    <a class="page-link" href="#"><i class="fa fa-angle-left"></i></a>
                </li>
                <li class="page-item active"><a class="page-link" href="#">${pg.current}</a></li>`;
    if (pg.current + 1 <= pg.total) {
        paginationHtml += `<li class="page-item"><a class="page-link" href="#">${pg.current + 1}</a></li>`;
    }
    if (pg.current + 2 <= pg.total) {
        paginationHtml += `<li class="page-item"><a class="page-link" href="#">${pg.current + 2}</a></li>`;
    }
    if (pg.current + 3 < pg.total) {
        paginationHtml += `<li class="page-item"><a class="page-link" href="#">...</a></li>`;
    }
    paginationHtml += `
                <li class="page-item"><a class="page-link" href="#">${pg.total}</a></li>
                <li class="page-item"><a class="page-link" href="#"><i class="fa fa-angle-right"></i></a></li>
            </ul>
        </nav>`;

    container.innerHTML = html + paginationHtml;
}

// ========== 渲染标签云 ==========
function renderTags() {
    const container = document.getElementById('tags-container');
    container.innerHTML = siteData.tags.map(tag =>
        `<a href="#" class="tag-cloud"><i class="tagfa fa fa-dot-circle-o"></i>${tag}</a>`
    ).join('');
}

// ========== 渲染最新评论 ==========
function renderComments() {
    const container = document.getElementById('comments-container');
    container.innerHTML = siteData.comments.map(c =>
        `<li class="comment-listitem">
            <div class="comment-user">
                <span class="comment-avatar">${c.avatar}</span>
            </div>
            <div class="comment-body">
                <span class="comment-author">${c.author}</span>
                <p class="comment-content">${c.content}</p>
            </div>
        </li>`
    ).join('');
}

// ========== 渲染随机推荐 ==========
function renderRandomPosts() {
    const container = document.getElementById('random-posts-container');
    container.innerHTML = siteData.randomPosts.map(p =>
        `<article class="widget-post">
            <div class="info">
                <a href="${p.link}" class="thumb">
                    <div class="thumb-placeholder" style="background:${p.gradient};"></div>
                </a>
                <h4 class="post-title-widget"><a href="${p.link}">${p.title}</a></h4>
                <time>${p.date}</time>
            </div>
        </article>`
    ).join('');
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

    // ========== 加载数据 ==========
    loadData();
});
