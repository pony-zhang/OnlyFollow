参考的bilibili的实现


```javascript
// ==UserScript==
// @name         B站首页替换为关注UP主随机视频
// @namespace    https://github.com/yourname
// @version      4.1
// @description  将首页推荐完全替换为关注UP主的随机视频（完全随机，不限于最新）
// @author       You
// @match        https://www.bilibili.com/
// @grant        GM_xmlhttpRequest
// @grant        GM_getCookie
// @grant        GM_setCookie
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      api.bilibili.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ====== 配置项 ======
    const MAX_UPS_TO_FETCH = 100;     // 最多获取多少个关注的UP主
    const VIDEOS_POOL_SIZE = 30;      // 每个UP主获取多少个视频作为候选池
    const VIDEOS_PER_UP = 2;          // 每个UP主最终选择几个视频
    const TOTAL_VIDEOS_NEEDED = 20;   // 总共需要多少个视频
    const REPLACE_COUNT = 10;         // 替换首页前多少个视频卡片
    const REQUEST_DELAY = 1500;       // 请求间隔(毫秒)
    const UP_LIST_CACHE_DURATION = 86400000;  // UP主列表缓存24小时
    const VIDEO_CACHE_DURATION = 7200000;     // 视频缓存2小时
    const MAX_RETRIES = 2;            // 最大重试次数
    const MIN_UPS_NEEDED = 15;        // 至少需要多少个不同的UP主
    // ===================

    // 工具函数
    function formatNumber(num) {
        if (num === undefined || num === null) return '0';
        if (typeof num !== 'number') num = parseInt(num) || 0;
        if (num >= 10000) return (num / 10000).toFixed(1) + '万';
        return num.toString();
    }

    function formatDuration(seconds) {
        if (typeof seconds === 'string' && seconds.includes(':')) {
            return seconds;
        }
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // 获取cookie
    function getCookie(name) {
        try {
            if (typeof GM_getCookie !== 'undefined') {
                const value = GM_getCookie(name);
                if (value) return value;
            }
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.startsWith(name + '=')) {
                    return cookie.substring(name.length + 1);
                }
            }
            return null;
        } catch (e) {
            console.error('获取cookie失败:', e);
            return null;
        }
    }

    // 缓存管理
    const Cache = {
        get: function(key) {
            try {
                const data = GM_getValue(key, null);
                if (!data) return null;
                if (Date.now() > data.expire) {
                    GM_deleteValue(key);
                    return null;
                }
                return data.value;
            } catch (e) {
                console.error('读取缓存失败:', e);
                return null;
            }
        },

        set: function(key, value, duration) {
            try {
                const data = {
                    value: value,
                    expire: Date.now() + duration
                };
                GM_setValue(key, data);
            } catch (e) {
                console.error('写入缓存失败:', e);
            }
        }
    };

    // 检查是否登录
    function isLogin() {
        const sessdata = getCookie('SESSDATA');
        const dedeUserID = getCookie('DedeUserID');
        const userInfo = document.querySelector('.nav-user-info') ||
                        document.querySelector('.user-con') ||
                        document.querySelector('.header-avatar-wrap');
        return !!(sessdata || dedeUserID || userInfo);
    }

    // 获取关注列表
    function fetchFollowings(uid, callback) {
        const cacheKey = `followings_${uid}`;
        const cached = Cache.get(cacheKey);

        if (cached) {
            console.log(`✅ 从缓存获取关注列表: ${cached.length} 个UP主`);
            callback(cached);
            return;
        }

        console.log('🔄 获取关注列表...');
        const allUps = [];
        let page = 1;
        const pageSize = 50;

        function fetchPage() {
            const url = `https://api.bilibili.com/x/relation/followings?vmid=${uid}&pn=${page}&ps=${pageSize}&order=desc`;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Cookie': document.cookie,
                    'Referer': 'https://www.bilibili.com'
                },
                onload: res => {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.code === 0) {
                            const ups = data.data.list.map(up => ({
                                mid: up.mid,
                                uname: up.uname,
                                face: up.face
                            }));
                            allUps.push(...ups);

                            if (data.data.list.length === pageSize && allUps.length < MAX_UPS_TO_FETCH) {
                                page++;
                                setTimeout(fetchPage, 500);
                            } else {
                                Cache.set(cacheKey, allUps, UP_LIST_CACHE_DURATION);
                                console.log(`✅ 获取关注列表完成: ${allUps.length} 个UP主`);
                                callback(allUps);
                            }
                        } else {
                            console.warn('获取关注列表失败:', data.message);
                            callback(allUps);
                        }
                    } catch (e) {
                        console.error('解析关注列表失败', e);
                        callback(allUps);
                    }
                },
                onerror: (err) => {
                    console.error('请求关注列表出错:', err);
                    callback(allUps);
                }
            });
        }

        fetchPage();
    }

    // 获取UP主的视频（获取视频池，然后随机选择）
    function fetchVideosByUP(mid, callback, retryCount = 0) {
        const cacheKey = `videos_pool_${mid}`;
        const cached = Cache.get(cacheKey);

        if (cached) {
            console.log(`✅ 从缓存获取UP ${mid} 的视频池`);
            // 从缓存的视频池中随机选择
            const randomVideos = getRandomVideosFromPool(cached, VIDEOS_PER_UP);
            callback(randomVideos);
            return;
        }

        // 获取更多视频作为候选池（按播放量排序，可以获取不同时期的视频）
        const url = `https://api.bilibili.com/x/space/arc/search?mid=${mid}&ps=${VIDEOS_POOL_SIZE}&tid=0&pn=1&order=click`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            headers: {
                'Cookie': document.cookie,
                'Referer': 'https://www.bilibili.com'
            },
            onload: res => {
                try {
                    const data = JSON.parse(res.responseText);
                    if (data.code === 0 && data.data.list && data.data.list.vlist) {
                        // 获取视频池
                        const videoPool = data.data.list.vlist.map(v => ({
                            bvid: v.bvid,
                            title: v.title,
                            author: v.author,
                            mid: v.mid,
                            cover: v.pic.startsWith('http://') ? v.pic.replace('http://', 'https://') : v.pic,
                            play: v.play,
                            danmaku: v.video_review || v.danmaku,
                            duration: v.length,
                            pubdate: v.created
                        }));

                        // 缓存整个视频池
                        Cache.set(cacheKey, videoPool, VIDEO_CACHE_DURATION);

                        // 从视频池中随机选择
                        const randomVideos = getRandomVideosFromPool(videoPool, VIDEOS_PER_UP);
                        console.log(`✅ 获取UP ${mid} 的视频池: ${videoPool.length} 个，随机选择 ${randomVideos.length} 个`);
                        callback(randomVideos);
                    } else {
                        if (data.message && data.message.includes('频繁') && retryCount < MAX_RETRIES) {
                            setTimeout(() => {
                                fetchVideosByUP(mid, callback, retryCount + 1);
                            }, (retryCount + 1) * 2000);
                        } else {
                            callback([]);
                        }
                    }
                } catch (e) {
                    console.error(`获取UP ${mid} 视频失败`, e);
                    callback([]);
                }
            },
            onerror: (err) => {
                console.error(`请求UP ${mid} 视频出错:`, err);
                if (retryCount < MAX_RETRIES) {
                    setTimeout(() => {
                        fetchVideosByUP(mid, callback, retryCount + 1);
                    }, (retryCount + 1) * 2000);
                } else {
                    callback([]);
                }
            }
        });
    }

    // 从视频池中随机选择视频
    function getRandomVideosFromPool(videoPool, count) {
        if (videoPool.length <= count) {
            return [...videoPool];
        }

        // 随机打乱并选择
        const shuffled = [...videoPool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    // 核心函数：获取多样化的随机视频
    async function getRandomVideosFromFollowings(ups) {
        console.log('🎲 开始获取随机视频...');

        // 1. 随机打乱UP主顺序
        const shuffledUps = [...ups].sort(() => Math.random() - 0.5);

        // 2. 计算需要多少个UP主
        const upsNeeded = Math.max(MIN_UPS_NEEDED, Math.ceil(TOTAL_VIDEOS_NEEDED / VIDEOS_PER_UP));
        const selectedUps = shuffledUps.slice(0, Math.min(upsNeeded, shuffledUps.length));

        console.log(`📌 选择了 ${selectedUps.length} 个UP主获取视频`);

        // 3. 并发获取视频（控制并发数）
        const allVideos = [];
        const batchSize = 5;

        for (let i = 0; i < selectedUps.length; i += batchSize) {
            const batch = selectedUps.slice(i, i + batchSize);

            const batchPromises = batch.map(up =>
                new Promise(resolve => {
                    fetchVideosByUP(up.mid, (videos) => {
                        if (videos.length > 0) {
                            console.log(`✅ ${up.uname}: 随机选择了 ${videos.length} 个视频`);
                            resolve(videos);
                        } else {
                            resolve([]);
                        }
                    });
                })
            );

            const batchResults = await Promise.all(batchPromises);
            allVideos.push(...batchResults.flat());

            // 批次间延迟
            if (i + batchSize < selectedUps.length) {
                await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
            }
        }

        // 4. 再次随机打乱所有视频
        const shuffledVideos = allVideos.sort(() => Math.random() - 0.5);

        console.log(`🎉 获取到 ${shuffledVideos.length} 个来自 ${selectedUps.length} 个不同UP主的随机视频`);

        return shuffledVideos.slice(0, TOTAL_VIDEOS_NEEDED);
    }

    // 替换视频卡片
    function replaceCardContent(card, video) {
        try {
            // 封面
            const coverImg = card.querySelector('.bili-video-card__cover img');
            if (coverImg) {
                const coverBase = video.cover + '@672w_378h_1c_!web-home-common-cover';
                coverImg.src = coverBase;
                coverImg.alt = video.title;

                const sources = card.querySelectorAll('.bili-video-card__cover source');
                sources.forEach(source => {
                    if (source.type === 'image/avif') {
                        source.srcset = coverBase + '.avif';
                    } else if (source.type === 'image/webp') {
                        source.srcset = coverBase + '.webp';
                    }
                });
            }

            // 链接
            const videoUrl = `https://www.bilibili.com/video/${video.bvid}`;
            const imageLink = card.querySelector('.bili-video-card__image--link');
            const titleLink = card.querySelector('.bili-video-card__info--tit a');
            const ownerLink = card.querySelector('.bili-video-card__info--owner');

            if (imageLink) imageLink.href = videoUrl;
            if (titleLink) {
                titleLink.href = videoUrl;
                titleLink.textContent = video.title;
                titleLink.title = video.title;
            }
            if (ownerLink) ownerLink.href = `//space.bilibili.com/${video.mid}`;

            // 标题
            const titleElement = card.querySelector('.bili-video-card__info--tit');
            if (titleElement) titleElement.title = video.title;

            // UP主
            const authorElement = card.querySelector('.bili-video-card__info--author');
            if (authorElement) {
                authorElement.textContent = video.author;
                authorElement.title = video.author;
            }

            // 统计数据
            const statsTexts = card.querySelectorAll('.bili-video-card__stats--text');
            if (statsTexts.length >= 2) {
                statsTexts[0].textContent = formatNumber(video.play);
                statsTexts[1].textContent = formatNumber(video.danmaku);
            }

            // 时长
            const durationElement = card.querySelector('.bili-video-card__stats__duration');
            if (durationElement) {
                durationElement.textContent = formatDuration(video.duration);
            }

            // 日期
            const dateElement = card.querySelector('.bili-video-card__info--date');
            if (dateElement) {
                const formattedDate = new Date(video.pubdate * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
                dateElement.textContent = `· ${formattedDate}`;
            }

        } catch (e) {
            console.error('替换卡片内容失败:', e);
        }
    }

    // 主逻辑
    async function main() {
        console.log('=== B站首页随机视频脚本 v4.1 开始执行 ===');

        const loginStatus = isLogin();
        if (!loginStatus) {
            console.warn('⚠️ 未登录，无法获取关注列表');
            return;
        }

        // 获取UID
        let myUID = window.__INITIAL_STATE__?.nav?.userInfo?.mid || getCookie('DedeUserID');
        if (!myUID) {
            console.warn('⚠️ 无法获取你的 UID');
            return;
        }

        console.log('🔍 获取关注列表... UID:', myUID);

        // 1. 获取所有关注的UP主
        fetchFollowings(myUID, async (ups) => {
            if (ups.length === 0) {
                console.warn('未获取到关注列表');
                return;
            }

            console.log(`✅ 获取到 ${ups.length} 个关注的UP主`);

            // 2. 获取随机视频
            const videos = await getRandomVideosFromFollowings(ups);

            if (videos.length === 0) {
                console.warn('⚠️ 未获取到任何视频');
                return;
            }

            console.log(`✅ 准备替换 ${videos.length} 个随机视频`);

            // 3. 等待页面加载并替换
            let attempts = 0;
            const maxAttempts = 20;

            const checkInterval = setInterval(() => {
                attempts++;
                const cards = document.querySelectorAll('.bili-video-card');

                if (cards.length >= REPLACE_COUNT || attempts >= maxAttempts) {
                    clearInterval(checkInterval);

                    if (cards.length === 0) {
                        console.warn('⚠️ 未找到视频卡片');
                        return;
                    }

                    const replaceCount = Math.min(REPLACE_COUNT, videos.length, cards.length);
                    console.log(`🔄 替换 ${replaceCount} 个视频卡片`);

                    for (let i = 0; i < replaceCount; i++) {
                        replaceCardContent(cards[i], videos[i]);
                    }

                    console.log('🎉 首页已完全替换为关注UP主的随机视频！');
                }
            }, 300);
        });
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        setTimeout(main, 500);
    }

})();
```
