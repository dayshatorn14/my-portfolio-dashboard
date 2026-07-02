import os
import json
import datetime
import requests
import yfinance as yf
import google.generativeai as genai
from duckduckgo_search import DDGS

# Configuration & Keys from Environment Variables
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
LINE_USER_ID = os.environ.get("LINE_USER_ID")

def load_json(filepath, default):
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
    return default

PORTFOLIO = load_json('portfolio_config.json', [])
RISK_CONFIG = load_json('risk_config.json', {
    "default_stop_loss_percent": -5.0,
    "default_take_profit_percent": 15.0,
    "custom_rules": {}
})

def get_exchange_rate():
    try:
        usd_thb = yf.Ticker("THB=X").history(period="1d")['Close'].iloc[-1]
        return float(usd_thb)
    except:
        return 34.00

def fetch_prices():
    usd_thb_rate = get_exchange_rate()
    updated_assets = []
    total_cost_thb = 0
    total_value_thb = 0

    for asset in PORTFOLIO:
        if asset['symbol'] == 'NEW': continue
        ticker = yf.Ticker(asset['ticker'])
        try:
            current_price = float(ticker.history(period="1d")['Close'].iloc[-1])
        except:
            current_price = 0
            
        asset_data = {
            "symbol": asset["symbol"],
            "shares": asset["shares"]
        }

        if asset["type"] == "TH_STOCK":
            asset_data["cost_per_unit_thb"] = asset["cost_thb"]
            asset_data["current_price_thb"] = current_price
            asset_data["total_value_thb"] = current_price * asset["shares"]
            
        elif asset["type"] == "US_FUND_PROXY":
            simulated_nav = 11.5046 
            asset_data["cost_per_unit_thb"] = asset["cost_thb"]
            asset_data["current_price_thb"] = simulated_nav
            asset_data["total_value_thb"] = simulated_nav * asset["shares"]
            
        elif asset["type"] == "GOLD":
            asset_data["cost_per_unit_usd"] = asset["cost_usd"]
            asset_data["current_price_usd"] = current_price
            asset_data["cost_per_unit_thb"] = asset["cost_usd"] * usd_thb_rate
            asset_data["current_price_thb"] = current_price * usd_thb_rate
            asset_data["total_value_thb"] = asset_data["current_price_thb"] * asset["shares"]

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

def run_risk_manager(assets):
    print("Running Risk Manager...")
    alerts = []
    default_sl = RISK_CONFIG.get("default_stop_loss_percent", -5.0)
    default_tp = RISK_CONFIG.get("default_take_profit_percent", 15.0)
    custom_rules = RISK_CONFIG.get("custom_rules", {})

    for asset in assets:
        symbol = asset['symbol']
        profit_pct = asset['profit_percent']
        
        sl = custom_rules.get(symbol, {}).get("stop_loss_percent", default_sl)
        tp = custom_rules.get(symbol, {}).get("take_profit_percent", default_tp)
        
        if profit_pct <= sl:
            alerts.append(f"🚨 [STOP LOSS] {symbol} ขาดทุน {profit_pct:.2f}% (จุดตัดขาดทุน: {sl}%) พิจารณาบริหารความเสี่ยงด่วน!")
        elif profit_pct >= tp:
            alerts.append(f"🎯 [TAKE PROFIT] {symbol} กำไร {profit_pct:.2f}% (เป้าหมาย: {tp}%) พิจารณาขายทำกำไร!")
            
    if alerts:
        send_line_text("\n".join(alerts))
    return alerts

def fetch_news(portfolio):
    print("Searching for news...")
    news_results = []
    
    queries = ["เศรษฐกิจไทย หุ้นไทย ข่าวธุรกิจ"]
    symbols = [asset['symbol'] for asset in portfolio if asset['symbol'] != 'NEW']
    if symbols:
        queries.append(f"หุ้น {' '.join(symbols)} ข่าว")
    queries.append("S&P500 ทองคำ ข่าวเศรษฐกิจโลก")
    
    with DDGS() as ddgs:
        for query in queries:
            try:
                results = ddgs.news(query, max_results=3, timelimit="w")
                for r in results:
                    news_results.append({
                        "title": r.get('title', ''),
                        "url": r.get('url', ''),
                        "source": r.get('source', ''),
                        "date": r.get('date', datetime.datetime.now(datetime.timezone.utc).isoformat())
                    })
            except Exception as e:
                pass
                
    unique_news = {n['url']: n for n in news_results if n['url']}.values()
    return sorted(unique_news, key=lambda x: x.get('date', ''), reverse=True)

def generate_ai_analysis(summary, assets, news_list):
    if not GEMINI_API_KEY:
        return {"market_analysis": "ไม่ได้ตั้งค่า Gemini API Key", "recommendations": {}, "daily_picks": []}
        
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-flash-latest')
    
    news_text = "\n".join([f"- {n['title']} ({n['source']})" for n in news_list[:12]]) if news_list else "ไม่มีข่าวเด่น"
    
    prompt = f"""
    คุณคือเครือข่าย AI จัดการพอร์ตการลงทุนอัจฉริยะ (ประกอบด้วย 1. Quant Analyst 2. Economist 3. Fund Manager)
    
    ข้อมูลพอร์ต:
    กำไร/ขาดทุนรวม: {summary['total_profit_percent']:.2f}%
    สินทรัพย์:
    {json.dumps(assets, indent=2, ensure_ascii=False)}
    
    📰 ข่าวเศรษฐกิจล่าสุด:
    {news_text}
    
    คำสั่ง: ประมวลผลร่วมกันและส่งคืนคำตอบเป็น JSON เท่านั้น โครงสร้างดังนี้:
    {{
        "market_analysis": "บทวิเคราะห์ตลาดภาพรวม (HTML format เช่น <p>... </p>)",
        "recommendations": {{
            "SYMBOL": {{"action": "BUY หรือ SELL หรือ HOLD", "reason": "เหตุผลสั้นๆ 1 ประโยค (ประเมินจากต้นทุนกำไรปัจจุบันประกอบข่าว)"}}
        }},
        "daily_picks": [
            {{
                "symbol": "ชื่อหุ้นแนะนำ", 
                "name": "ชื่อบริษัท/กลุ่มธุรกิจ", 
                "reason": "ทำไมถึงน่าสนใจในวันนี้", 
                "tag": "หมวดหมู่เช่น Tech, Value, Dividend"
            }}
        ]
    }}
    หมายเหตุ: daily_picks ให้เลือกหุ้นเด่น 2 ตัวที่ **ไม่มี** ในพอร์ตปัจจุบัน อ้างอิงจากข่าวล่าสุด
    """
    try:
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        return json.loads(response.text)
    except Exception as e:
        print(f"Error calling AI: {e}")
        return {"market_analysis": f"Error: {e}", "recommendations": {}, "daily_picks": []}

def send_line_text(msg):
    if not LINE_CHANNEL_ACCESS_TOKEN or not LINE_USER_ID:
        return
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}"
    }
    data = {"to": LINE_USER_ID, "messages": [{"type": "text", "text": msg}]}
    requests.post(url, headers=headers, json=data)

def send_line_summary(summary, assets):
    sign = "+" if summary['total_profit_thb'] >= 0 else ""
    msg = f"📈 อัปเดตพอร์ตประจำวัน!\n"
    msg += f"💰 มูลค่ารวม: ฿{summary['total_value_thb']:,.2f}\n"
    msg += f"📊 กำไร: {sign}฿{summary['total_profit_thb']:,.2f} ({sign}{summary['total_profit_percent']:.2f}%)\n\nเช็คคำแนะนำ AI และ Daily Picks ได้บนเว็บครับ"
    send_line_text(msg)

def main():
    print("Fetching prices...")
    summary, assets = fetch_prices()
    
    run_risk_manager(assets)
    
    print("Fetching news...")
    new_news = fetch_news(PORTFOLIO)
    
    old_news = []
    try:
        if os.path.exists('data.json'):
            with open('data.json', 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                old_news = old_data.get('news', [])
    except: pass
        
    combined_news = {n['url']: n for n in (new_news + old_news) if 'url' in n}
    all_news = sorted(combined_news.values(), key=lambda x: x.get('date', ''), reverse=True)[:20]
    
    print("Generating AI Analysis (Team)...")
    ai_analysis = generate_ai_analysis(summary, assets, all_news)
    
    print("Sending LINE Summary...")
    send_line_summary(summary, assets)
    
    output = {
        "last_updated": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(),
        "summary": summary,
        "assets": assets,
        "ai_analysis": ai_analysis,
        "news": all_news
    }
    
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=4)
        
    print("data.json updated successfully.")

if __name__ == "__main__":
    main()
