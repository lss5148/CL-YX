/**
 * fill_sidebar_data.js
 * 给 data/posts-index.json 填上侧边栏需要的两类数据：
 *  - comments: 对齐原站「最新评论」的 5 条样例（站里没评论系统，用固定数据）
 *  - weeklyRank: 近 7 天 Top5（按浏览量），前端直接读这个字段，避免每周重算
 */
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'data', 'posts-index.json');
const d = JSON.parse(fs.readFileSync(p, 'utf8'));

// ---------- 最新评论（固定 5 条，风格对齐原站） ----------
d.comments = [
    {
        author: '一点都对',
        avatar: '一',
        date: '2026-10-02',
        link: '/article.html?id=63',
        title: '新作[互动3D/调教巨乳/动态] 打着发音练习幌子的深喉调教',
        content: '螺丝钉模拟器的玩法。动一下得一次分，看着就累',
    },
    {
        author: 'kongtiaoyu',
        avatar: 'k',
        date: '2026-10-02',
        link: '/article.html?id=62',
        title: '新作[互动SLG/动态] 我至今仍无法忘怀那天看到的种马压',
        content: '4个解压码都试过了都不对，麻烦看看链接',
    },
    {
        author: 'csdw',
        avatar: 'c',
        date: '2026-10-01',
        link: '/article.html?id=61',
        title: '更新[欧美SLG/动态] 友善主妇 Friendly Housewife',
        content: 'PC端放错游戏了，重新下了一次才对',
    },
    {
        author: 'lles16',
        avatar: 'l',
        date: '2026-10-01',
        link: '/article.html?id=60',
        title: '更新[精品互动SLG/调教/像素动态] 恶魔女王的诱惑',
        content: '拉完了，不要玩，无聊重复性的小游戏加重复剧情',
    },
    {
        author: '姬姬',
        avatar: '姬',
        date: '2026-09-30',
        link: '/article.html?id=59',
        title: '新作[日式RPG/动态] 异世界转生物语',
        content: '感谢分享，已经下载完成，汉化质量不错',
    },
];

// ---------- 周榜：近 7 天浏览量 Top5（没有真实浏览量时退化为最新 5 篇） ----------
const now = new Date();
const weekAgo = new Date(now.getTime() - 7 * 86400000);
const weekPosts = d.posts.filter(p => p.date && new Date(p.date) >= weekAgo);
const rank = (weekPosts.length ? weekPosts : d.posts)
    .slice()
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5)
    .map(p => ({
        id: p.id,
        title: p.title,
        link: p.link,
        image: p.image,
        gradient: p.gradient,
        date: p.date,
    }));
d.weeklyRank = rank;

fs.writeFileSync(p, JSON.stringify(d, null, 0));
console.log('comments:', d.comments.length, 'weeklyRank:', d.weeklyRank.length);
console.log('weeklyRank top:', d.weeklyRank[0] ? d.weeklyRank[0].title.slice(0, 30) : '-');
