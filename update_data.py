import os
import json
import datetime
import requests
import yfinance as yf
import google.generativeai as genai

# Configuration & Keys from Environment Variables (GitHub Secrets)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
LINE_USER_ID = os.environ.get("LINE_USER_ID")

# Load Portfolio Definition
try:
    with open('portfolio_config.json', 'r', encoding='utf-8') as f:
        PORTFOLIO = json.load(f)
except Exception as e:
    print("Error loading portfolio config:", e)
    PORTFOLIO = []

def get_exchange_rate():
    # USD to THB
    try:
        usd_thb = yf.Ticker("THB=X").history(period="1d")['Close'].iloc[-1]
        return float(usd_thb)
    except:
        return 33.33 # Fallback

def fetch_prices():
    usd_thb_rate = get_exchange_rate()
    updated_assets = []
    total_cost_thb = 0
    total_value_thb = 0

    for asset in PORTFOLIO:
        ticker = yf.Ticker(asset['ticker'])
        try:
            current_price = float(ticker.history(period="1d")['Close'].iloc[-1])
        except:
            current_price = 0 # Error fallback
            
        asset_data = {
            "symbol": asset["symbol"],
            "shares": asset["shares"]
        }

        if asset["type"] == "TH_STOCK":
            asset_data["cost_per_unit_thb"] = asset["cost_thb"]
            asset_data["current_price_thb"] = current_price
            asset_data["total_value_thb"] = current_price * asset["shares"]
            
        elif asset["type"] == "US_FUND_PROXY":
            # For simplicity in this demo, we estimate NAV movement based on ETF percentage change
            # Real implementation would scrape AMEX/NAV directly. We'll use a simulated fixed NAV update for demo.
            # Here we just assume IVV price change % applies to NAV cost.
            # To keep it simple, we use a static estimate or last known NAV for this example script
            # In a real app, you'd scrape the KAsset website.
            simulated_nav = 11.5046 # Using last known
            asset_data["cost_per_unit_thb"] = asset["cost_thb"]
            asset_data["current_price_thb"] = simulated_nav
            asset_data["total_value_thb"] = simulated_nav * asset["shares"]
            
        elif asset["type"] == "GOLD":
            asset_data["cost_per_unit_usd"] = asset["cost_usd"]
            asset_data["current_price_usd"] = current_price
            
            asset_data["cost_per_unit_thb"] = asset["cost_usd"] * usd_thb_rate
            asset_data["current_price_thb"] = current_price * usd_thb_rate
            asset_data["total_value_thb"] = asset_data["current_price_thb"] * asset["shares"]

        # Calculate Profits
        total_cost_thb += (asset_data["cost_per_unit_thb"] * asset["shares"])
        total_value_thb += asset_data["total_value_thb"]
        
        asset_data["profit_thb"] = asset_data["total_value_thb"] - (asset_data["cost_per_unit_thb"] * asset["shares"])
        asset_data["profit_percent"] = (asset_data["profit_thb"] / (asset_data["cost_per_unit_thb"] * asset["shares"])) * 100
        
        updated_assets.append(asset_data)

    total_profit_thb = total_value_thb - total_cost_thb
    total_profit_percent = (total_profit_thb / total_cost_thb) * 100 if total_cost_thb > 0 else 0

    summary = {
        "total_value_thb": total_value_thb,
        "total_profit_thb": total_profit_thb,
        "total_profit_percent": total_profit_percent
    }
    
    return summary, updated_assets

def generate_ai_analysis(summary, assets):
    if not GEMINI_API_KEY:
        return "<p>ไม่ได้ตั้งค่า Gemini API Key จึงไม่มีบทวิเคราะห์จาก AI ในรอบนี้</p>"
        
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-pro')
    
    prompt = f"""
    คุณคือผู้เชี่ยวชาญด้านการลงทุน พอร์ตของฉันมีดังนี้:
    กำไร/ขาดทุนรวม: {summary['total_profit_percent']:.2f}% (มูลค่ารวม {summary['total_value_thb']:.2f} บาท)
    สินทรัพย์:
    {json.dumps(assets, indent=2, ensure_ascii=False)}
    
    กรุณาวิเคราะห์สั้นๆ (ไม่เกิน 3-4 บรรทัด) ถึงแนวโน้มตลาดของหุ้น SCB, SIRI, OSP และ S&P500 วันนี้ พร้อมสรุปความเสี่ยง 
    เขียนเป็นภาษาไทย และใช้ HTML tags (เช่น <h3>, <p>, <ul>, <li>, <strong>) ในการจัดรูปแบบให้สวยงาม
    """
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"<p>เกิดข้อผิดพลาดในการเรียก AI: {str(e)}</p>"

def send_line_message(summary, assets):
    if not LINE_CHANNEL_ACCESS_TOKEN or not LINE_USER_ID:
        print("No LINE Channel Access Token or User ID found. Skipping alert.")
        return
        
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}"
    }
    
    sign = "+" if summary['total_profit_thb'] >= 0 else ""
    msg = f"📈 อัปเดตพอร์ตล่าสุด!\n"
    msg += f"💰 มูลค่ารวม: ฿{summary['total_value_thb']:,.2f}\n"
    msg += f"📊 กำไร/ขาดทุน: {sign}฿{summary['total_profit_thb']:,.2f} ({sign}{summary['total_profit_percent']:.2f}%)\n"
    
    for a in assets:
        s = "+" if a['profit_thb'] >= 0 else ""
        msg += f"\n- {a['symbol']}: {s}{a['profit_percent']:.2f}%"
        
    data = {
        "to": LINE_USER_ID,
        "messages": [
            {
                "type": "text",
                "text": msg
            }
        ]
    }
    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 200:
        print("LINE Message sent successfully.")
    else:
        print(f"Failed to send LINE Message: {response.status_code} {response.text}")

def main():
    print("Fetching prices...")
    summary, assets = fetch_prices()
    
    print("Generating AI Analysis...")
    ai_analysis = generate_ai_analysis(summary, assets)
    
    print("Sending LINE Message...")
    send_line_message(summary, assets)
    
    output = {
        "last_updated": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(),
        "summary": summary,
        "assets": assets,
        "ai_analysis": ai_analysis
    }
    
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=4)
        
    print("data.json updated successfully.")

if __name__ == "__main__":
    main()
