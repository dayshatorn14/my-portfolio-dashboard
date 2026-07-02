document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch data from local json or GitHub pages hosted json
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error('ไม่สามารถโหลดข้อมูลได้');
        }
        const data = await response.json();
        
        // Update timestamp
        const updateTime = new Date(data.last_updated).toLocaleString('th-TH');
        document.getElementById('last-updated').textContent = `อัปเดตล่าสุด: ${updateTime}`;
        
        // Update Portfolio Summary
        const totalValueEl = document.getElementById('total-value');
        const totalProfitEl = document.getElementById('total-profit');
        
        totalValueEl.textContent = `฿${data.summary.total_value_thb.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        const profitValue = data.summary.total_profit_thb;
        const profitPercent = data.summary.total_profit_percent;
        const profitSign = profitValue >= 0 ? '+' : '';
        const profitClass = profitValue >= 0 ? 'profit' : 'loss';
        
        totalProfitEl.textContent = `${profitSign}฿${Math.abs(profitValue).toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${profitSign}${profitPercent.toFixed(2)}%)`;
        totalProfitEl.className = profitClass;

        // Update Table
        const tbody = document.getElementById('assets-body');
        tbody.innerHTML = '';
        
        data.assets.forEach(asset => {
            const isProfit = asset.profit_thb >= 0;
            const pSign = isProfit ? '+' : '';
            const pClass = isProfit ? 'profit' : 'loss';
            
            // Format numbers
            const shares = asset.shares % 1 === 0 ? asset.shares.toLocaleString('th-TH') : asset.shares.toLocaleString('th-TH', {minimumFractionDigits: 4, maximumFractionDigits: 4});
            
            // For Gold, show USD info in smaller text
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

        // Update AI Analysis
        const aiContent = document.getElementById('ai-content');
        if (data.ai_analysis) {
            // Convert markdown-like newlines to HTML
            aiContent.innerHTML = data.ai_analysis.replace(/\n/g, '<br>');
        } else {
            aiContent.innerHTML = '<p>ไม่มีบทวิเคราะห์ในขณะนี้</p>';
        }

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('last-updated').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล โปรดตรวจสอบว่าไฟล์ data.json มีอยู่จริง';
        document.getElementById('ai-content').innerHTML = '<p style="color: #ef4444;">ไม่สามารถโหลดข้อมูลได้ กรุณารันสคริปต์ Python เพื่อสร้างข้อมูลก่อน</p>';
    }
});
