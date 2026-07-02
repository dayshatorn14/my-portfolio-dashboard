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

    // --- Load Main Data ---
    async function loadDashboardData() {
        try {
            // Cache busting for latest data
            const response = await fetch(`data.json?t=${new Date().getTime()}`);
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            const data = await response.json();
            
            lastKnownUpdate = data.last_updated;
            const updateTime = new Date(data.last_updated).toLocaleString('th-TH');
            document.getElementById('last-updated').textContent = `อัปเดตล่าสุด: ${updateTime}`;
            
            document.getElementById('total-value').textContent = `฿${data.summary.total_value_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            
            const profitValue = data.summary.total_profit_thb;
            const profitPercent = data.summary.total_profit_percent;
            const profitSign = profitValue >= 0 ? '+' : '';
            const profitClass = profitValue >= 0 ? 'profit' : 'loss';
            
            const totalProfitEl = document.getElementById('total-profit');
            totalProfitEl.textContent = `${profitSign}฿${Math.abs(profitValue).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${profitSign}${profitPercent.toFixed(2)}%)`;
            totalProfitEl.className = profitClass;

            const tbody = document.getElementById('assets-body');
            tbody.innerHTML = '';
            
            data.assets.forEach(asset => {
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

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${asset.symbol}</strong></td>
                    <td>${shares}</td>
                    <td>${costText}</td>
                    <td>${currentText}</td>
                    <td>฿${asset.total_value_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="${pClass}">${pSign}฿${Math.abs(asset.profit_thb).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <br><span style="font-size: 0.85em;">(${pSign}${asset.profit_percent.toFixed(2)}%)</span></td>
                `;
                tbody.appendChild(tr);
            });

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
            if (data.ai_analysis) {
                aiContent.innerHTML = data.ai_analysis.replace(/\n/g, '<br>');
            } else {
                aiContent.innerHTML = '<p>ไม่มีบทวิเคราะห์ในขณะนี้</p>';
            }

            return data.last_updated;

        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('last-updated').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
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
    function checkAutoTrigger() {
        if (!lastKnownUpdate || !githubPAT || !githubRepo) return;
        
        const lastTime = new Date(lastKnownUpdate).getTime();
        const now = new Date().getTime();
        const diffMinutes = (now - lastTime) / (1000 * 60);

        if (diffMinutes > 15) {
            console.log("Data is older than 15 minutes. Auto-triggering refresh...");
            triggerGitHubAction("กำลังอัปเดตข้อมูลอัตโนมัติ เนื่องจากข้อมูลเก่าเกิน 15 นาที...");
        }
    }

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
    checkAutoTrigger(); // Check if we need to auto-refresh on load

    // --- Settings Logic ---
    document.getElementById('btn-settings').addEventListener('click', () => {
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
    document.getElementById('btn-refresh').addEventListener('click', () => {
        triggerGitHubAction('ระบบกำลังดึงข้อมูลล่าสุด... (รอประมาณ 1 นาที เว็บจะรีเฟรชเอง)');
    });

    // --- Edit Portfolio Logic ---
    document.getElementById('btn-edit-portfolio').addEventListener('click', () => {
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
