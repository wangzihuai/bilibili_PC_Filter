// ==UserScript==
// @name         B站内容过滤器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  过滤B站推荐内容：支持关键词过滤、UP主过滤、鼠标悬停快速添加功能
// @author       BilibiliFilter
// @match        https://www.bilibili.com/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 过滤管理器
    class BilibiliFilterManager {
        constructor() {
            // 从本地存储加载过滤规则
            this.keywords = JSON.parse(localStorage.getItem('bilibili_filtered_keywords')) || [];
            this.blockedUsers = JSON.parse(localStorage.getItem('bilibili_blocked_users')) || [];
            this.isUIVisible = false;

            this.initUI();
            this.initHoverHandler();
            this.startFiltering();
        }

        // 保存数据到本地存储
        saveData() {
            localStorage.setItem('bilibili_filtered_keywords', JSON.stringify(this.keywords));
            localStorage.setItem('bilibili_blocked_users', JSON.stringify(this.blockedUsers));
        }

        // 添加关键词
        addKeyword(keyword) {
            if (keyword && !this.keywords.includes(keyword)) {
                this.keywords.push(keyword);
                this.saveData();
                this.renderKeywordList();
                this.filterContent();
            }
        }

        // 删除关键词
        removeKeyword(keyword) {
            this.keywords = this.keywords.filter(kw => kw !== keyword);
            this.saveData();
            this.renderKeywordList();
        }

        // 添加被屏蔽的用户
        addBlockedUser(userId, username = '') {
            const userInfo = { id: userId, name: username };
            if (!this.blockedUsers.find(user => user.id === userId)) {
                this.blockedUsers.push(userInfo);
                this.saveData();
                this.renderBlockedUsersList();
                this.filterContent();
            }
        }

        // 删除被屏蔽的用户
        removeBlockedUser(userId) {
            this.blockedUsers = this.blockedUsers.filter(user => user.id !== userId);
            this.saveData();
            this.renderBlockedUsersList();
        }

        // 初始化UI界面
        initUI() {
            // 创建切换按钮
            const toggleButton = document.createElement('button');
            toggleButton.innerText = '📝 过滤管理';
            toggleButton.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 10001;
                background: #00a1d6;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            toggleButton.addEventListener('click', () => this.toggleUI());
            document.body.appendChild(toggleButton);

            // 创建主面板
            const panel = document.createElement('div');
            panel.id = 'bilibiliFilterPanel';
            panel.style.cssText = `
                position: fixed;
                top: 120px;
                right: 20px;
                width: 350px;
                max-height: 500px;
                overflow-y: auto;
                z-index: 10000;
                background: white;
                border: 1px solid #e1e2e3;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            `;

            // 标题
            const title = document.createElement('h3');
            title.innerText = '内容过滤管理';
            title.style.cssText = 'margin: 0 0 15px 0; color: #333; font-size: 16px;';
            panel.appendChild(title);

            // 关键词过滤部分
            const keywordSection = this.createSection('关键词过滤', 'keyword');
            panel.appendChild(keywordSection);

            // UP主过滤部分
            const userSection = this.createSection('UP主过滤', 'user');
            panel.appendChild(userSection);

            // 统计信息
            const statsDiv = document.createElement('div');
            statsDiv.id = 'filterStats';
            statsDiv.style.cssText = `
                margin-top: 15px;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 4px;
                font-size: 12px;
                color: #666;
            `;
            panel.appendChild(statsDiv);

            document.body.appendChild(panel);
            this.renderKeywordList();
            this.renderBlockedUsersList();
            this.updateStats();
        }

        // 创建各个部分的UI
        createSection(title, type) {
            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom: 20px;';

            const sectionTitle = document.createElement('h4');
            sectionTitle.innerText = title;
            sectionTitle.style.cssText = 'margin: 0 0 10px 0; color: #333; font-size: 14px;';
            section.appendChild(sectionTitle);

            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 10px;';

            const input = document.createElement('input');
            input.type = 'text';
            input.id = `new${type.charAt(0).toUpperCase() + type.slice(1)}Input`;
            input.placeholder = type === 'keyword' ? '输入关键词...' : '输入用户ID或用户名...';
            input.style.cssText = `
                flex: 1;
                padding: 6px 10px;
                border: 1px solid #d9d9d9;
                border-radius: 4px;
                font-size: 12px;
            `;
            inputContainer.appendChild(input);

            const addButton = document.createElement('button');
            addButton.innerText = '添加';
            addButton.style.cssText = `
                padding: 6px 12px;
                background: #00a1d6;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            `;
            addButton.addEventListener('click', () => {
                const value = input.value.trim();
                if (value) {
                    if (type === 'keyword') {
                        this.addKeyword(value);
                    } else {
                        // 尝试从用户输入中提取用户ID
                        const userId = this.extractUserId(value);
                        if (userId) {
                            this.addBlockedUser(userId, value);
                        }
                    }
                    input.value = '';
                }
            });
            inputContainer.appendChild(addButton);

            section.appendChild(inputContainer);

            const list = document.createElement('div');
            list.id = `${type}List`;
            list.style.cssText = 'max-height: 150px; overflow-y: auto;';
            section.appendChild(list);

            return section;
        }

        // 提取用户ID（支持多种输入格式）
        extractUserId(input) {
            // 如果是纯数字，直接返回
            if (/^\d+$/.test(input)) {
                return input;
            }

            // 如果是URL，提取用户ID
            const urlMatch = input.match(/space\.bilibili\.com\/(\d+)/);
            if (urlMatch) {
                return urlMatch[1];
            }

            // 如果包含@，可能是用户名，暂时存储为用户名
            return input;
        }

        // 渲染关键词列表
        renderKeywordList() {
            const list = document.getElementById('keywordList');
            if (!list) return;

            list.innerHTML = '';
            this.keywords.forEach(keyword => {
                const item = this.createListItem(keyword, () => this.removeKeyword(keyword));
                list.appendChild(item);
            });
        }

        // 渲染被屏蔽用户列表
        renderBlockedUsersList() {
            const list = document.getElementById('userList');
            if (!list) return;

            list.innerHTML = '';
            this.blockedUsers.forEach(user => {
                const displayText = user.name ? `${user.name} (${user.id})` : user.id;
                const item = this.createListItem(displayText, () => this.removeBlockedUser(user.id));
                list.appendChild(item);
            });
        }

        // 创建列表项
        createListItem(text, onRemove) {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 8px;
                margin: 2px 0;
                background: #f5f5f5;
                border-radius: 4px;
                font-size: 12px;
            `;

            const textSpan = document.createElement('span');
            textSpan.innerText = text;
            textSpan.style.cssText = 'flex: 1; word-break: break-all;';
            item.appendChild(textSpan);

            const removeButton = document.createElement('button');
            removeButton.innerText = '×';
            removeButton.style.cssText = `
                background: #ff4757;
                color: white;
                border: none;
                border-radius: 3px;
                width: 20px;
                height: 20px;
                cursor: pointer;
                font-size: 12px;
                margin-left: 8px;
            `;
            removeButton.addEventListener('click', onRemove);
            item.appendChild(removeButton);

            return item;
        }

        // 切换UI显示/隐藏
        toggleUI() {
            const panel = document.getElementById('bilibiliFilterPanel');
            this.isUIVisible = !this.isUIVisible;
            panel.style.display = this.isUIVisible ? 'block' : 'none';
            this.updateStats();
        }

        // 初始化鼠标悬停处理
        initHoverHandler() {
            let hoverTimeout;
            this.currentTooltip = null;
            this.isTooltipHovered = false;

            // 使用事件委托来处理动态加载的内容
            document.addEventListener('mouseover', (e) => {
                try {
                    // 检查是否悬停在tooltip上
                    if (e.target.closest('.bilibili-filter-tooltip')) {
                        this.isTooltipHovered = true;
                        return;
                    }

                    // 找到最近的视频卡片
                    const videoCard = e.target.closest('.bili-video-card');
                    if (!videoCard) return;

                    // 计算这是第几个视频卡片 (调试用)
                    const allCards = document.querySelectorAll('.bili-video-card');
                    const cardIndex = Array.from(allCards).indexOf(videoCard) + 1;

                    // 支持多种可能的UP主元素选择器 - 更准确的匹配
                    const authorElement = e.target.closest('.bili-video-card__info--owner') ||
                                        e.target.closest('.bili-video-card__info--author');

                    // 如果没找到，尝试在视频卡片内查找UP主元素
                    let targetElement = authorElement;
                    if (!targetElement) {
                        // 在当前视频卡片内查找UP主相关元素
                        if (e.target.classList.contains('bili-video-card__info--author') ||
                            e.target.classList.contains('bili-video-card__info--owner')) {
                            targetElement = e.target;
                        } else {
                            // 查找父级或子级中的UP主元素
                            targetElement = videoCard.querySelector('.bili-video-card__info--owner') ||
                                          videoCard.querySelector('.bili-video-card__info--author');

                            // 检查鼠标是否在UP主区域内
                            if (targetElement) {
                                const rect = targetElement.getBoundingClientRect();
                                const mouseX = e.clientX;
                                const mouseY = e.clientY;

                                if (mouseX < rect.left || mouseX > rect.right ||
                                    mouseY < rect.top || mouseY > rect.bottom) {
                                    targetElement = null;
                                }
                            }
                        }
                    }

                    // 额外检查：如果鼠标在author相关的文本或链接上
                    if (!targetElement) {
                        const authorRelatedElements = [
                            e.target.closest('a[href*="space.bilibili.com"]'),
                            e.target.closest('[class*="author"]'),
                            e.target.closest('[class*="owner"]')
                        ].filter(Boolean);

                        if (authorRelatedElements.length > 0) {
                            targetElement = authorRelatedElements[0];
                        }
                    }

                    if (targetElement) {
                        // 清除之前的tooltip
                        this.clearTooltip();

                        hoverTimeout = setTimeout(() => {
                            this.showFilterTooltip(targetElement, cardIndex);
                        }, 400); // 减少到0.4秒

                        console.log(`Hover detected on card ${cardIndex}, author element:`, targetElement);
                        console.log('Element classes:', targetElement.className);
                        console.log('Element href:', targetElement.getAttribute('href'));
                    } else {
                        console.log(`Card ${cardIndex}: No author element found for:`, e.target);
                    }
                } catch (err) {
                    console.log('Hover handler error:', err);
                }
            });

            document.addEventListener('mouseout', (e) => {
                try {
                    if (hoverTimeout) {
                        clearTimeout(hoverTimeout);
                        hoverTimeout = null;
                    }

                    // 检查是否离开tooltip
                    if (e.target.closest('.bilibili-filter-tooltip')) {
                        this.isTooltipHovered = false;
                        // 延迟清除，给用户时间移动鼠标
                        setTimeout(() => {
                            if (!this.isTooltipHovered) {
                                this.clearTooltip();
                            }
                        }, 300);
                        return;
                    }

                    const authorElement = e.target.closest('.bili-video-card__info--owner') ||
                                        e.target.closest('.bili-video-card__info--author');

                    if (authorElement) {
                        // 延迟清除tooltip，给用户时间移动到tooltip
                        setTimeout(() => {
                            if (!this.isTooltipHovered) {
                                this.clearTooltip();
                            }
                        }, 300);
                    }
                } catch (err) {
                    console.log('Mouseout handler error:', err);
                }
            });
        }

        // 清除tooltip
        clearTooltip() {
            if (this.currentTooltip && this.currentTooltip.parentNode) {
                this.currentTooltip.remove();
                this.currentTooltip = null;
                this.isTooltipHovered = false;
            }
        }

        // 显示过滤提示框
        showFilterTooltip(authorElement, cardIndex = 0) {
            try {
                const userId = this.extractUserIdFromElement(authorElement);

                // 尝试多种方式获取UP主名称 - 根据新的HTML结构优化
                let username = '';

                // 方法1: 查找.bili-video-card__info--author span (最常见)
                const authorSpan = authorElement.querySelector('.bili-video-card__info--author');
                if (authorSpan) {
                    username = authorSpan.textContent?.trim() || authorSpan.getAttribute('title')?.trim() || '';
                }

                // 方法2: 如果当前元素就是author span
                if (!username && authorElement.classList.contains('bili-video-card__info--author')) {
                    username = authorElement.textContent?.trim() || authorElement.getAttribute('title')?.trim() || '';
                }

                // 方法3: 查找任何有title属性的span
                if (!username) {
                    const titleSpan = authorElement.querySelector('span[title]') || authorElement;
                    if (titleSpan && titleSpan.getAttribute('title')) {
                        username = titleSpan.getAttribute('title').trim();
                    }
                }

                // 方法4: 从当前元素或其父元素的文本内容中提取
                if (!username) {
                    const textContent = authorElement.textContent?.trim() || '';
                    // 移除日期信息 (如 "· 8-31")
                    username = textContent.replace(/\s*·\s*\d{1,2}-\d{1,2}\s*$/, '').trim();
                }

                // 方法5: 从href链接查找最近的UP主区域
                if (!username && userId) {
                    const videoCard = authorElement.closest('.bili-video-card');
                    if (videoCard) {
                        const ownerElement = videoCard.querySelector('.bili-video-card__info--owner');
                        if (ownerElement) {
                            const ownerSpan = ownerElement.querySelector('.bili-video-card__info--author');
                            if (ownerSpan) {
                                username = ownerSpan.textContent?.trim() || ownerSpan.getAttribute('title')?.trim() || '';
                            }
                        }
                    }
                }

                console.log(`Card ${cardIndex} - Tooltip data:`, {
                    userId,
                    username,
                    element: authorElement,
                    elementClass: authorElement.className,
                    textContent: authorElement.textContent?.trim()
                });

                if (!userId && !username) {
                    console.log(`Card ${cardIndex}: No user ID or username found`);
                    return;
                }

                // 检查是否已经被屏蔽
                const isBlocked = this.blockedUsers.find(user => user.id === userId || user.name === username);
                if (isBlocked) {
                    console.log(`Card ${cardIndex}: User already blocked:`, username);
                    return;
                }

                // 清除现有tooltip
                this.clearTooltip();

                const tooltip = document.createElement('div');
                tooltip.className = 'bilibili-filter-tooltip';
                tooltip.style.cssText = `
                    position: absolute;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    z-index: 10002;
                    cursor: pointer;
                    white-space: nowrap;
                    pointer-events: auto;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    border: 2px solid #ff4757;
                    font-weight: bold;
                    transition: all 0.2s ease;
                    max-width: 300px;
                    word-wrap: break-word;
                    white-space: normal;
                `;
                tooltip.textContent = `🚫 点击屏蔽: ${username || '此UP主'} (卡片${cardIndex})`;

                // 定位tooltip - 改进定位算法
                const rect = authorElement.getBoundingClientRect();
                const tooltipLeft = Math.min(rect.left + window.scrollX, window.innerWidth - 320);
                const tooltipTop = rect.bottom + window.scrollY + 8;

                tooltip.style.left = `${tooltipLeft}px`;
                tooltip.style.top = `${tooltipTop}px`;

                // 鼠标进入tooltip时保持显示
                tooltip.addEventListener('mouseenter', () => {
                    this.isTooltipHovered = true;
                    tooltip.style.background = 'rgba(255, 71, 87, 0.9)';
                    tooltip.style.transform = 'scale(1.05)';
                    console.log('Tooltip hovered - keeping visible');
                });

                // 鼠标离开tooltip时延迟清除
                tooltip.addEventListener('mouseleave', () => {
                    this.isTooltipHovered = false;
                    tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
                    tooltip.style.transform = 'scale(1)';
                    setTimeout(() => {
                        if (!this.isTooltipHovered) {
                            this.clearTooltip();
                        }
                    }, 300);
                    console.log('Tooltip unhovered - will clear after delay');
                });

                tooltip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // 使用用户ID或用户名作为标识
                    const identifier = userId || username || Date.now().toString();
                    this.addBlockedUser(identifier, username);
                    this.clearTooltip();

                    // 显示成功提示
                    this.showSuccessMessage(`已屏蔽UP主: ${username || '该UP主'}`);

                    console.log('User blocked:', { id: identifier, name: username });
                });

                tooltip.addEventListener('mouseover', () => {
                    // 鼠标悬停在tooltip上时保持显示
                    console.log('Tooltip hovered');
                });

                document.body.appendChild(tooltip);
                this.currentTooltip = tooltip;

                console.log('Tooltip shown for:', username);

                // 10秒后自动消失
                setTimeout(() => {
                    if (!this.isTooltipHovered) {
                        this.clearTooltip();
                    }
                }, 10000);

            } catch (err) {
                console.log('Tooltip error:', err);
            }
        }

        // 显示成功消息
        showSuccessMessage(message) {
            const successDiv = document.createElement('div');
            successDiv.style.cssText = `
                position: fixed;
                top: 50px;
                right: 20px;
                background: #52c41a;
                color: white;
                padding: 12px 16px;
                border-radius: 6px;
                z-index: 10003;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            successDiv.textContent = message;
            document.body.appendChild(successDiv);

            setTimeout(() => {
                if (successDiv.parentNode) {
                    successDiv.remove();
                }
            }, 3000);
        }

        // 从元素中提取用户ID
        extractUserIdFromElement(authorElement) {
            try {
                // 检查多种可能的href属性位置
                let href = authorElement.getAttribute('href');

                // 如果当前元素没有href，尝试查找子元素或父元素
                if (!href) {
                    const linkElement = authorElement.querySelector('a[href]') ||
                                      authorElement.closest('a[href]') ||
                                      authorElement.parentElement?.querySelector('a[href]');
                    if (linkElement) {
                        href = linkElement.getAttribute('href');
                    }
                }

                // 如果还是没找到，尝试在当前元素的兄弟元素中查找
                if (!href && authorElement.parentElement) {
                    const siblingLink = authorElement.parentElement.querySelector('a[href*="space.bilibili.com"]');
                    if (siblingLink) {
                        href = siblingLink.getAttribute('href');
                    }
                }

                console.log('Found href:', href);

                if (href) {
                    const match = href.match(/space\.bilibili\.com\/(\d+)/);
                    if (match) {
                        console.log('Extracted user ID:', match[1]);
                        return match[1];
                    }
                }

                console.log('No user ID found in href');
            } catch (err) {
                console.log('Extract user ID error:', err);
            }
            return null;
        }

        // 开始内容过滤
        startFiltering() {
            try {
                // 延迟初始过滤，等待页面完全加载
                setTimeout(() => {
                    this.filterContent();
                }, 1000);

                // 监听DOM变化，但添加防抖
                let filterTimeout;
                const observer = new MutationObserver(() => {
                    if (filterTimeout) {
                        clearTimeout(filterTimeout);
                    }
                    filterTimeout = setTimeout(() => {
                        this.filterContent();
                    }, 300); // 300ms防抖
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            } catch (err) {
                console.log('Start filtering error:', err);
            }
        }

        // 主要过滤函数
        filterContent() {
            try {
                let hiddenCount = 0;

                // 过滤视频卡片
                const videoCards = document.querySelectorAll('.bili-video-card');
                videoCards.forEach(card => {
                    try {
                        if (this.shouldHideElement(card)) {
                            if (card.style.display !== 'none') {
                                card.style.display = 'none';
                                hiddenCount++;
                            }
                        } else {
                            if (card.style.display === 'none') {
                                card.style.display = '';
                            }
                        }
                    } catch (err) {
                        console.log('Filter card error:', err);
                    }
                });

                // 过滤其他类型的内容
                this.filterOtherContent();

                this.hiddenCount = hiddenCount;
                if (this.isUIVisible) {
                    this.updateStats();
                }
            } catch (err) {
                console.log('Filter content error:', err);
            }
        }

        // 判断是否应该隐藏元素
        shouldHideElement(element) {
            try {
                // 标题过滤
                const titleElement = element.querySelector('.bili-video-card__info--tit a');
                if (titleElement) {
                    const title = titleElement.textContent || titleElement.innerText || '';
                    for (const keyword of this.keywords) {
                        if (title.includes(keyword)) {
                            return true;
                        }
                    }
                }

                // UP主过滤
                const authorElement = element.querySelector('.bili-video-card__info--owner');
                if (authorElement) {
                    const userId = this.extractUserIdFromElement(authorElement);
                    if (userId && this.blockedUsers.find(user => user.id === userId)) {
                        return true;
                    }
                }
            } catch (err) {
                console.log('Should hide element error:', err);
            }
            return false;
        }

        // 过滤其他内容
        filterOtherContent() {
            try {
                // 过滤分类内容（电视剧、电影、国漫等）
                const categoryCards = document.querySelectorAll('div.floor-single-card');
                categoryCards.forEach(card => {
                    if (card.style.display !== 'none') {
                        card.style.display = 'none';
                    }
                });

                // 过滤直播内容
                const liveCards = document.querySelectorAll('div.bili-live-card');
                liveCards.forEach(card => {
                    if (card.style.display !== 'none') {
                        card.style.display = 'none';
                    }
                });

                // 过滤广告 - 更温和的处理方式
                const adCards = document.querySelectorAll('div.bili-video-card.is-rcmd:not(.enable-no-interest)');
                adCards.forEach(card => {
                    if (card.style.display !== 'none') {
                        card.style.display = 'none';
                    }
                });
            } catch (err) {
                console.log('Filter other content error:', err);
            }
        }

        // 更新统计信息
        updateStats() {
            const statsDiv = document.getElementById('filterStats');
            if (statsDiv) {
                statsDiv.innerHTML = `
                    <div>📊 过滤统计</div>
                    <div>关键词规则: ${this.keywords.length} 条</div>
                    <div>屏蔽UP主: ${this.blockedUsers.length} 个</div>
                    <div>本次隐藏: ${this.hiddenCount || 0} 个视频</div>
                `;
            }
        }
    }

    // 等待页面加载完成后启动过滤器
    function initializeFilter() {
        try {
            console.log('Bilibili Filter: Initializing...');
            new BilibiliFilterManager();
            console.log('Bilibili Filter: Initialized successfully');
        } catch (err) {
            console.error('Bilibili Filter: Initialization failed', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFilter);
    } else {
        // 如果页面已经加载完成，延迟一点启动
        setTimeout(initializeFilter, 500);
    }

})();
