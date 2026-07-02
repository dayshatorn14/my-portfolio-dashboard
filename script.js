document.addEventListener('DOMContentLoaded', async () => {
    // --- State ---
    let portfolioConfig = [];
    let githubPAT = localStorage.getItem('github_pat') || '';
    let githubRepo = localStorage.getItem('github_repo') || '';
    let lastKnownUpdate = null;
    let pollInterval = null;

    // --- DOM Elements ---
    const settingsModal = document.getElementById('settings-modal');
    const portfolioModal = document.getElementById('portfolio-modal');
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    // --- Theme Toggle ---
    const themeToggle = document.getElementById('theme-toggle');
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.add('light-theme');
        themeToggle.textContent = '☀️';
    }
    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('light-theme');
        if (document.documentElement.classList.contains('light-theme')) {
            localStorage.setItem('theme', 'light');
            themeToggle.textContent = '☀️';
        } else {
            localStorage.setItem('theme', 'dark');
            themeToggle.textContent = '🌙';
        }
    });

    // --- Notification Logic ---
    const notificationBtn = document.getElementById('notification-btn');
    const notificationDropdown = document.getElementById('notification-dropdown');
    notificationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationDropdown.style.display = notificationDropdown.style.display === 'none' ? 'block' : 'none';
        document.getElementById('notification-badge').style.display = 'none';
    });
    document.addEventListener('click', () => {
        if (notificationDropdown) notificationDropdown.style.display = 'none';
    });
    notificationDropdown.addEventListener('click', (e) => e.stopPropagation());

    // --- Load Main Data ---
    let currentData = null; // Store data for sorting
    let sortCol = '';
    let sortAsc = true;
    let tvWidget = null;

    // --- SPA Navigation ---
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const viewSections = document.querySelectorAll('.view-section');

    function switchView(targetId) {
        navLinks.forEach(link => link.classList.remove('active'));
        document.querySelector(`.sidebar-nav a[data-target="${targetId}"]`).classList.add('active');
        
        viewSections.forEach(sec => sec.style.display = 'none');
        document.getElementById(targetId).style.display = 'block';

        if (targetId === 'view-market') {
            if (!tvWidget) {
                initTradingView('NASDAQ:AAPL');
            }
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(link.getAttribute('data-target'));
            // Close mobile menu if open
            const sidebar = document.getElementById('sidebar');
            if(sidebar) sidebar.classList.remove('open');
        });
    });

    // --- Mobile Menu ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }

    // --- TradingView Logic ---
    function initTradingView(symbol) {
        if (typeof TradingView !== 'undefined') {
            document.getElementById('tradingview_chart').innerHTML = '';
            tvWidget = new TradingView.widget({
                "autosize": true,
                "symbol": symbol,
                "interval": "D",
                "timezone": "Asia/Bangkok",
                "theme": "dark",
                "style": "1",
                "locale": "en",
                "enable_publishing": false,
                "backgroundColor": "rgba(0, 0, 0, 0)",
                "gridColor": "rgba(255, 255, 255, 0.05)",
                "hide_top_toolbar": false,
                "hide_legend": false,
                "save_image": false,
                "container_id": "tradingview_chart"
            });
        }
    }

    // --- Search Logic ---
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim().toUpperCase();
            if (query) {
                switchView('view-market');
                initTradingView(query);
            }
        }
    });

    // --- Sorting Logic ---
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (sortCol === col) {
                sortAsc = !sortAsc;
            } else {
                sortCol = col;
                sortAsc = true;
            }
            if (currentData) renderAssetsTable(currentData);
        });
    });

    function renderAssetsTable(data) {
        const tbody = document.getElementById('portfolio-body');
        tbody.innerHTML = '';
        
        let recs = {};
        let isJsonAnalysis = false;
        if (data.ai_analysis && typeof data.ai_analysis === 'object') {
            isJsonAnalysis = true;
            recs = data.ai_analysis.recommendations || {};
        }

        let sortedAssets = [...data.assets];
        if (sortCol) {
            sortedAssets.sort((a, b) => {
                let valA, valB;
                if (sortCol === 'symbol') { valA = a.symbol; valB = b.symbol; }
                else if (sortCol === 'shares') { valA = a.shares; valB = b.shares; }
                else if (sortCol === 'cost') { valA = a.cost_per_unit_thb; valB = b.cost_per_unit_thb; }
                else if (sortCol === 'price') { valA = a.current_price_thb; valB = b.current_price_thb; }
                else if (sortCol === 'value') { valA = a.total_value_thb; valB = b.total_value_thb; }
                else if (sortCol === 'profit') { valA = a.profit_thb; valB = b.profit_thb; }
                
                if (valA < valB) return sortAsc ? -1 : 1;
                if (valA > valB) return sortAsc ? 1 : -1;
                return 0;
            });
        }
        
        sortedAssets.forEach(asset => {
            const isProfit = asset.profit_thb >= 0;
            const pSign = isProfit ? '+' : '';
            const pClass = isProfit ? 'profit' : 'loss';
            
            const shares = asset.shares % 1 === 0 ? asset.shares.toLocaleString('th-TH') : asset.shares.toLocaleString('th-TH', {minimumFractionDigits: 4, maximumFractionDigits: 4});
            
            let costText = `฿${asset.cost_per_unit_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            let currentText = `฿${asset.current_price_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            
            if (asset.symbol === 'MTS-GOLD') {
                costText += `<br><span style="font-size: 0.8rem; color: #94a3b8;">$${asset.cost_per_unit_usd.toLocaleString('en-US')}</span>`;
                currentText += `<br><span style="font-size: 0.8rem; color: #94a3b8;">$${asset.current_price_usd.toLocaleString('en-US')}</span>`;
            }

            let recBadge = '';
            if (isJsonAnalysis && recs[asset.symbol]) {
                const rec = recs[asset.symbol];
                const action = rec.action ? rec.action.toUpperCase() : '';
                if (action.includes('BUY')) {
                    recBadge = `<span class="rec-badge buy" title="${rec.reason}">⬆️</span> `;
                } else if (action.includes('SELL')) {
                    recBadge = `<span class="rec-badge sell" title="${rec.reason}">⬇️</span> `;
                } else if (action.includes('HOLD')) {
                    recBadge = `<span class="rec-badge hold" title="${rec.reason}">⏳</span> `;
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${recBadge}<strong>${asset.symbol}</strong></td>
                <td>${shares}</td>
                <td>${costText}</td>
                <td>${currentText}</td>
                <td>฿${asset.total_value_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td class="${pClass}">${pSign}฿${Math.abs(asset.profit_thb).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <br><span style="font-size: 0.85em;">(${pSign}${asset.profit_percent.toFixed(2)}%)</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function loadDashboardData() {
        try {
            // Cache busting for latest data
            const response = await fetch(`data.json?t=${new Date().getTime()}`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            const data = await response.json();
            
            lastKnownUpdate = data.last_updated;
            const updateTime = new Date(data.last_updated).toLocaleString('th-TH');
            document.getElementById('last-update').textContent = `อัปเดตล่าสุด: ${updateTime}`;
            document.getElementById('total-balance-display').textContent = `฿${data.summary.total_value_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            
            currentData = data;
            
            const profitValue = data.summary.total_profit_thb;
            const profitPercent = data.summary.total_profit_percent;
            const profitSign = profitValue >= 0 ? '+' : '';
            const profitClass = profitValue >= 0 ? 'positive' : 'negative';
            
            const totalProfitEl = document.getElementById('total-profit-display');
            totalProfitEl.textContent = `${profitSign}฿${Math.abs(profitValue).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${profitSign}${profitPercent.toFixed(2)}%)`;
            totalProfitEl.className = 'profit-amount ' + profitClass;

            renderAssetsTable(data);

            // Render News
            const newsListEl = document.getElementById('news-list');
            if (data.news && data.news.length > 0) {
                newsListEl.innerHTML = '';
                data.news.forEach(n => {
                    const d = new Date(n.date).toLocaleString('th-TH');
                    const item = document.createElement('div');
                    item.className = 'news-item';
                    item.innerHTML = `
                        <a href="${n.url}" target="_blank" rel="noopener noreferrer">${n.title}</a>
                        <div class="news-meta">
                            <span>🏢 ${n.source}</span>
                            <span>🕒 ${d}</span>
                        </div>
                    `;
                    newsListEl.appendChild(item);
                });
            } else {
                newsListEl.innerHTML = '<p style="color: #cbd5e1;">ไม่มีข่าวสารในช่วงนี้</p>';
            }

            const aiContent = document.getElementById('ai-content');
            const isJsonAnalysis = data.ai_analysis && typeof data.ai_analysis === 'object';
            
            if (isJsonAnalysis) {
                let html = '';
                if (data.ai_analysis.market_analysis) {
                    html += `<div class="ai-block"><h3>📊 ภาพรวมตลาด</h3>${data.ai_analysis.market_analysis}</div>`;
                }
                aiContent.innerHTML = html;
                
                // Render Daily Picks
                const picksEl = document.getElementById('daily-picks');
                if (data.ai_analysis.daily_picks && data.ai_analysis.daily_picks.length > 0) {
                    picksEl.innerHTML = '';
                    data.ai_analysis.daily_picks.forEach(pick => {
                        const div = document.createElement('div');
                        div.className = 'pick-item';
                        div.innerHTML = `
                            <div class="pick-header">
                                <span class="pick-symbol">${pick.symbol}</span>
                                <span class="pick-tag">${pick.tag}</span>
                            </div>
                            <div class="pick-name">${pick.name}</div>
                            <div class="pick-reason">${pick.reason}</div>
                        `;
                        picksEl.appendChild(div);
                    });
                } else {
                    picksEl.innerHTML = '<p style="color: #cbd5e1;">กำลังสแกนหาโอกาสใหม่ๆ...</p>';
                }
                
            } else if (data.ai_analysis) {
                aiContent.innerHTML = typeof data.ai_analysis === 'string' ? data.ai_analysis.replace(/\n/g, '<br>') : '';
                document.getElementById('daily-picks').innerHTML = '<p>ไม่มีข้อมูลหุ้นแนะนำในรอบนี้</p>';
            } else {
                aiContent.innerHTML = '<p>ไม่มีบทวิเคราะห์ในขณะนี้</p>';
                document.getElementById('daily-picks').innerHTML = '<p>ไม่มีข้อมูลหุ้นแนะนำในรอบนี้</p>';
            }

            // Render Global Watchlist
            const watchlistContainer = document.getElementById('global-watchlist-container');
            if (data.global_watchlist && data.global_watchlist.length > 0) {
                watchlistContainer.innerHTML = '';
                data.global_watchlist.forEach(stock => {
                    const div = document.createElement('div');
                    div.className = 'pick-item';
                    div.innerHTML = `
                        <div class="pick-header">
                            <span class="pick-symbol">${stock.symbol}</span>
                            <span class="pick-tag">${stock.exchange || stock.category}</span>
                        </div>
                        <div class="pick-name">${stock.name}</div>
                        <div class="pick-reason">${stock.reason}</div>
                    `;
                    watchlistContainer.appendChild(div);
                });
            } else {
                watchlistContainer.innerHTML = '<p style="color: #cbd5e1;">ไม่มีข้อมูล Global Watchlist ในขณะนี้</p>';
            }

            // Update Notification Dropdown
            const notifList = document.getElementById('notification-list');
            const dateStr = new Date(data.last_updated).toLocaleString('th-TH');
            notifList.innerHTML = `<div style="padding: 10px 0; font-size: 0.85rem;">
                <strong style="color: var(--primary-light);">System Sync Completed</strong><br>
                <span style="color: var(--text-main);">Data successfully updated at ${dateStr}</span>
            </div>`;
            document.getElementById('notification-badge').style.display = 'block';

            return data.last_updated;

        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('last-update').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
            return null;
        }
    }

    // --- Load Config ---
    async function loadPortfolioConfig() {
        try {
            const response = await fetch(`portfolio_config.json?t=${new Date().getTime()}`);
            if (response.ok) {
                portfolioConfig = await response.json();
            }
        } catch (e) {
            console.error("Error loading config", e);
        }
    }

    // --- Auto Trigger & Polling ---
    // --- Auto Trigger & Polling ---
    // (Auto-refresh on page load disabled as requested)

    function startPollingForUpdates() {
        if (pollInterval) clearInterval(pollInterval);
        const originalUpdate = lastKnownUpdate;
        
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`data.json?t=${new Date().getTime()}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.last_updated !== originalUpdate) {
                        // Data changed!
                        clearInterval(pollInterval);
                        await loadDashboardData();
                        hideLoading();
                        alert("อัปเดตข้อมูลและรีเฟรชหน้าเว็บเรียบร้อยแล้ว!");
                    }
                }
            } catch (e) {
                console.error("Polling error", e);
            }
        }, 10000); // Poll every 10 seconds
    }

    async function triggerGitHubAction(loadingMessage) {
        if (!githubPAT || !githubRepo) {
            alert('กรุณาตั้งค่า GitHub PAT และ Repository ในเมนูตั้งค่าก่อนครับ');
            settingsModal.style.display = 'block';
            return;
        }

        showLoading(loadingMessage);
        try {
            const response = await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/update.yml/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubPAT}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ref: 'main' })
            });

            if (response.ok) {
                // Start polling instead of just alerting
                startPollingForUpdates();
            } else {
                const err = await response.json();
                alert(`เกิดข้อผิดพลาด: ${err.message}`);
                hideLoading();
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
            hideLoading();
        }
    }

    // --- Initial Load ---
    await loadDashboardData();
    await loadPortfolioConfig();

    // --- Settings Logic ---
    document.getElementById('api-settings-btn').addEventListener('click', () => {
        document.getElementById('github-pat').value = githubPAT;
        document.getElementById('github-repo').value = githubRepo;
        settingsModal.style.display = 'block';
    });

    document.getElementById('close-settings').addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    document.getElementById('save-settings').addEventListener('click', () => {
        githubPAT = document.getElementById('github-pat').value.trim();
        githubRepo = document.getElementById('github-repo').value.trim();
        localStorage.setItem('github_pat', githubPAT);
        localStorage.setItem('github_repo', githubRepo);
        settingsModal.style.display = 'none';
        alert('บันทึกการตั้งค่าแล้ว');
    });

    // --- Refresh Logic (GitHub API) ---
    document.getElementById('sync-data-btn').addEventListener('click', () => {
        triggerGitHubAction('ระบบกำลังดึงข้อมูลล่าสุด... (รอประมาณ 1 นาที เว็บจะรีเฟรชเอง)');
    });

    // --- Edit Portfolio Logic ---
    document.getElementById('manage-portfolio-btn').addEventListener('click', () => {
        renderEditTable();
        portfolioModal.style.display = 'block';
    });

    document.getElementById('close-portfolio').addEventListener('click', () => {
        portfolioModal.style.display = 'none';
    });

    function renderEditTable() {
        const tbody = document.getElementById('edit-portfolio-body');
        tbody.innerHTML = '';
        portfolioConfig.forEach((asset, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="text" value="${asset.symbol}" onchange="updateAsset(${index}, 'symbol', this.value)"></td>
                <td><input type="text" value="${asset.ticker}" onchange="updateAsset(${index}, 'ticker', this.value)"></td>
                <td><input type="number" step="any" value="${asset.shares}" onchange="updateAsset(${index}, 'shares', this.value)"></td>
                <td><input type="number" step="any" value="${asset.cost_thb || asset.cost_usd}" onchange="updateAsset(${index}, '${asset.type === 'GOLD' ? 'cost_usd' : 'cost_thb'}', this.value)"></td>
                <td>
                    <select onchange="updateAsset(${index}, 'type', this.value)">
                        <option value="TH_STOCK" ${asset.type === 'TH_STOCK' ? 'selected' : ''}>TH_STOCK</option>
                        <option value="US_FUND_PROXY" ${asset.type === 'US_FUND_PROXY' ? 'selected' : ''}>US_FUND_PROXY</option>
                        <option value="GOLD" ${asset.type === 'GOLD' ? 'selected' : ''}>GOLD</option>
                    </select>
                </td>
                <td><button class="btn btn-danger" onclick="removeAsset(${index})">ลบ</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.updateAsset = (index, field, value) => {
        if (field === 'shares' || field === 'cost_thb' || field === 'cost_usd') {
            portfolioConfig[index][field] = parseFloat(value);
        } else {
            portfolioConfig[index][field] = value;
        }
    };

    window.removeAsset = (index) => {
        portfolioConfig.splice(index, 1);
        renderEditTable();
    };

    document.getElementById('add-asset-btn').addEventListener('click', () => {
        portfolioConfig.push({
            symbol: "NEW", ticker: "", shares: 0, cost_thb: 0, type: "TH_STOCK"
        });
        renderEditTable();
    });

    document.getElementById('save-portfolio-btn').addEventListener('click', async () => {
        if (!githubPAT || !githubRepo) {
            alert('กรุณาตั้งค่า GitHub PAT และ Repository ในเมนูตั้งค่าก่อนครับ');
            return;
        }

        showLoading('กำลังบันทึกพอร์ตและอัปเดตไฟล์...');
        try {
            let sha = '';
            const getRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/portfolio_config.json`, {
                headers: { 'Authorization': `Bearer ${githubPAT}` }
            });
            
            if (getRes.ok) {
                const getJson = await getRes.json();
                sha = getJson.sha;
            }

            const jsonString = JSON.stringify(portfolioConfig, null, 4);
            const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

            const putRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/portfolio_config.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${githubPAT}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: "Update portfolio config via Web UI",
                    content: base64Content,
                    sha: sha || undefined
                })
            });

            if (!putRes.ok) throw new Error('ไม่สามารถอัปเดตไฟล์บน GitHub ได้');

            portfolioModal.style.display = 'none';
            triggerGitHubAction('บันทึกสำเร็จ! กำลังรันข้อมูลใหม่ (รอประมาณ 1 นาที เว็บจะรีเฟรชเอง)');

        } catch (e) {
            alert(`Error: ${e.message}`);
            hideLoading();
        }
    });

    function showLoading(text) {
        loadingText.textContent = text;
        overlay.style.display = 'flex';
    }

    function hideLoading() {
        overlay.style.display = 'none';
    }
});
