document.addEventListener('DOMContentLoaded', async () => {
    // --- State ---
    let portfolioConfig = [];
    let githubPAT = localStorage.getItem('github_pat') || '';
    let githubRepo = localStorage.getItem('github_repo') || '';

    // --- DOM Elements ---
    const settingsModal = document.getElementById('settings-modal');
    const portfolioModal = document.getElementById('portfolio-modal');
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    // --- Load Main Data ---
    async function loadDashboardData() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');
            const data = await response.json();
            
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

            const aiContent = document.getElementById('ai-content');
            if (data.ai_analysis) {
                aiContent.innerHTML = data.ai_analysis.replace(/\n/g, '<br>');
            } else {
                aiContent.innerHTML = '<p>ไม่มีบทวิเคราะห์ในขณะนี้</p>';
            }

        } catch (error) {
            console.error('Error loading data:', error);
            document.getElementById('last-updated').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
        }
    }

    // --- Load Config ---
    async function loadPortfolioConfig() {
        try {
            // Add cache-busting to get latest config
            const response = await fetch(`portfolio_config.json?t=${new Date().getTime()}`);
            if (response.ok) {
                portfolioConfig = await response.json();
            }
        } catch (e) {
            console.error("Error loading config", e);
        }
    }

    // --- Initial Load ---
    await loadDashboardData();
    await loadPortfolioConfig();

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
    document.getElementById('btn-refresh').addEventListener('click', async () => {
        if (!githubPAT || !githubRepo) {
            alert('กรุณาตั้งค่า GitHub PAT และ Repository ในเมนูตั้งค่าก่อนครับ');
            settingsModal.style.display = 'block';
            return;
        }

        showLoading('กำลังสั่งรันระบบเพื่อดึงข้อมูลล่าสุด...');
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
                alert('สั่งรันสำเร็จแล้ว! กรุณารอประมาณ 1-2 นาที แล้วรีเฟรชหน้าเว็บนี้อีกครั้ง');
            } else {
                const err = await response.json();
                alert(`เกิดข้อผิดพลาด: ${err.message}`);
            }
        } catch (e) {
            alert(`Error: ${e.message}`);
        } finally {
            hideLoading();
        }
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
            // 1. Get SHA of existing file
            let sha = '';
            const getRes = await fetch(`https://api.github.com/repos/${githubRepo}/contents/portfolio_config.json`, {
                headers: { 'Authorization': `Bearer ${githubPAT}` }
            });
            
            if (getRes.ok) {
                const getJson = await getRes.json();
                sha = getJson.sha;
            }

            // 2. Encode new content to Base64 (utf-8 safe)
            const jsonString = JSON.stringify(portfolioConfig, null, 4);
            const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

            // 3. Put new file
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

            // 4. Trigger workflow
            showLoading('บันทึกสำเร็จ กำลังสั่งดึงข้อมูลล่าสุด...');
            await fetch(`https://api.github.com/repos/${githubRepo}/actions/workflows/update.yml/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${githubPAT}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ref: 'main' })
            });

            alert('สำเร็จ! บันทึกพอร์ตและสั่งอัปเดตแล้ว กรุณารอ 1-2 นาทีแล้วกดรีเฟรชหน้าเว็บ');
            portfolioModal.style.display = 'none';

        } catch (e) {
            alert(`Error: ${e.message}`);
        } finally {
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
