import os
import json
import datetime
import requests
import yfinance as yf
import google.generativeai as genai
from duckduckgo_search import DDGS

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
    try:
        usd_thb = yf.Ticker("THB=X").history(period="1d")['Close'].iloc[-1]
        return float(usd_thb)
    except:
        return 33.33

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

def fetch_news(portfolio):
    print("Searching for news...")
    news_results = []
    
    queries = ["เศรษฐกิจไทย หุ้นไทย ข่าว"]
    symbols = [asset['symbol'] for asset in portfolio if asset['symbol'] != 'NEW']
    if symbols:
        queries.append(f"หุ้น {' '.join(symbols)} ข่าวธุรกิจ")
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
                print(f"Error fetching news for '{query}': {e}")
                
    unique_news = {n['url']: n for n in news_results if n['url']}.values()
    sorted_news = sorted(unique_news, key=lambda x: x.get('date', ''), reverse=True)
    return sorted_news

def generate_ai_analysis(summary, assets, news_list):
    if not GEMINI_API_KEY:
        return {"market_analysis": "ไม่ได้ตั้งค่า Gemini API Key", "recommendations": {}, "industry_suggestions": ""}
        
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-flash-latest')
    
    news_text = "\n".join([f"- {n['title']} ({n['source']})" for n in news_list[:10]]) if news_list else "ไม่มีข่าวเด่นในช่วงนี้"
    
    prompt = f"""
    คุณคือผู้เชี่ยวชาญด้านการลงทุน พอร์ตของฉันมีดังนี้:
    กำไร/ขาดทุนรวม: {summary['total_profit_percent']:.2f}% (มูลค่ารวม {summary['total_value_thb']:.2f} บาท)
    สินทรัพย์:
    {json.dumps(assets, indent=2, ensure_ascii=False)}
    
    📰 ข่าวเศรษฐกิจ/การลงทุน ล่าสุด:
    {news_text}
    
    คำสั่ง: ส่งคืนข้อมูลเป็น JSON เท่านั้น (ไม่ต้องใส่ backticks หรือ markdown ใดๆ) โดยมีโครงสร้างดังนี้:
    {{
        "market_analysis": "วิเคราะห์ผลกระทบจากข่าวล่าสุดที่มีต่อภาพรวมพอร์ตว่าเป็นบวกหรือลบ (HTML format เช่น <p>... </p>)",
        "recommendations": {{
            "SYMBOL1": {{"action": "BUY หรือ SELL หรือ HOLD", "reason": "เหตุผลสั้นๆ 1 ประโยค"}},
            "SYMBOL2": {{"action": "BUY หรือ SELL หรือ HOLD", "reason": "เหตุผลสั้นๆ 1 ประโยค"}}
        }},
        "industry_suggestions": "เสนอแนะกลุ่มอุตสาหกรรมอื่นที่กำลังน่าสนใจ 1-2 กลุ่ม (HTML format เช่น <ul><li>...</li></ul>)"
    }}
    วิเคราะห์หุ้นทุกตัวที่มีในสินทรัพย์ (ยกเว้น NEW) และใส่ใน recommendations
    """
    try:
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        return json.loads(response.text)
    except Exception as e:
        print(f"Error calling AI: {e}")
        return {"market_analysis": f"Error: {e}", "recommendations": {}, "industry_suggestions": ""}

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
    msg = f"📈 อัปเดตพอร์ต & ข่าวล่าสุด!\n"
    msg += f"💰 มูลค่ารวม: ฿{summary['total_value_thb']:,.2f}\n"
    msg += f"📊 กำไร: {sign}฿{summary['total_profit_thb']:,.2f} ({sign}{summary['total_profit_percent']:.2f}%)\n"
    
    for a in assets:
        s = "+" if a['profit_thb'] >= 0 else ""
        msg += f"\n- {a['symbol']}: {s}{a['profit_percent']:.2f}%"
        
    msg += "\n\n📰 มีบทวิเคราะห์คำแนะนำ (ซื้อ/ขาย/ถือ) และข่าวใหม่ล่าสุด! กดดูรายละเอียดบนเว็บได้เลยครับ"
        
    data = {
        "to": LINE_USER_ID,
        "messages": [
            {
                "type": "text",
                "text": msg
            }
        ]
    }
    requests.post(url, headers=headers, json=data)

def main():
    print("Fetching prices...")
    summary, assets = fetch_prices()
    
    print("Fetching news...")
    new_news = fetch_news(PORTFOLIO)
    
    old_news = []
    try:
        if os.path.exists('data.json'):
            with open('data.json', 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                old_news = old_data.get('news', [])
    except Exception as e:
        print("Error loading old data.json for news history:", e)
        
    # Merge and keep unique by URL, then sort by date, max 20 items
    combined_news = {n['url']: n for n in (new_news + old_news) if 'url' in n}
    all_news = sorted(combined_news.values(), key=lambda x: x.get('date', ''), reverse=True)[:20]
    
    print("Generating AI Analysis...")
    ai_analysis = generate_ai_analysis(summary, assets, all_news)
    
    print("Sending LINE Message...")
    send_line_message(summary, assets)
    
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
