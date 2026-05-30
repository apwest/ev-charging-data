import json
import os
import requests
from collections import defaultdict
from datetime import datetime, timezone, timedelta

"""
Format of historical weather data API request:
https://api.weather.com/v1/location/{LOCATION}/observations/historical.json?apiKey={API_KEY}&units={UNITS}&startDate={START_DATE}&endDate={END_DATE}

Parameters:
- LOCATION: The location code (e.g., KOWD:9:US for a specific weather station).
- API_KEY: Your API key for accessing the weather data.
- UNITS: The unit system (e.g., 'e' for English units).
- START_DATE: The start date for the historical data in YYYYMMDD format.
- END_DATE: The end date for the historical data in YYYYMMDD format.
"""
LOCATION = os.environ.get("WEATHER_LOCATION", "KOWD:9:US")
# Never hardcode the key — read it from the environment (and a GitHub Actions secret in CI).
API_KEY = os.environ.get("WEATHER_API_KEY")
UNITS = "e"
START_DATE = "20251130"
END_DATE = "20251206"

if not API_KEY:
    raise SystemExit("Set WEATHER_API_KEY in the environment (see .env.example).")

def fetch_weather_data(start_date: str, end_date: str, date_fmt: str = "%Y%m%d") -> dict:
    """
    Fetch historical weather data for all months between start_date and end_date (inclusive).
    Checks for cached data in local files before making API requests.

    Args:
        start_date (str): The start date in YYYYMMDD format.
        end_date (str): The end date in YYYYMMDD format.

    Returns:
        dict: Combined weather data from all months.
    """
    def yyyymmdd_to_date(s):
        return datetime.strptime(s, date_fmt)

    def month_range(start_dt, end_dt):
        months = []
        current = datetime(start_dt.year, start_dt.month, 1)
        while current <= end_dt:
            last_day = (datetime(current.year + int(current.month == 12), (current.month % 12) + 1, 1) - timedelta(days=1)).day
            months.append((
                current.strftime("%Y%m01"),
                current.strftime(f"%Y%m{last_day:02d}")
            ))
            # Move to next month
            if current.month == 12:
                current = datetime(current.year + 1, 1, 1)
            else:
                current = datetime(current.year, current.month + 1, 1)
        return months

    start_dt = yyyymmdd_to_date(start_date)
    end_dt = yyyymmdd_to_date(end_date)
    all_observations = []

    for month_start, month_end in month_range(start_dt, end_dt):
        filename = f"weather-{month_start}-{month_end}.json"
        if os.path.exists(filename):
            with open(filename, "r") as f:
                weather_data = json.load(f)
            print(f"Loaded cached data from {filename}")
        else:
            url = f"https://api.weather.com/v1/location/{LOCATION}/observations/historical.json"
            params = {
                "apiKey": API_KEY,
                "units": UNITS,
                "startDate": month_start,
                "endDate": month_end
            }
            response = requests.get(url, params=params)
            if response.status_code == 200:
                weather_data = response.json()
                with open(filename, "w") as f:
                    json.dump(weather_data, f, indent=4)
                print(f"Fetched and cached data to {filename}")
            else:
                print(f"Failed to fetch data: {response.status_code} - {response.text}")
                continue
        all_observations.extend(weather_data.get("observations", []))

    return {"observations": all_observations}

"""
Format of JSON historical weather data:

{
    "metadata": {
        "language": "en-US",
        "transaction_id": "1767534956414:-368550296",
        "version": "1",
        "location_id": "KOWD:9:US",
        "units": "e",
        "expire_time_gmt": 1767538556,
        "status_code": 200
    },
    "observations": [
        {
            "key": "KOWD",
            "class": "observation",
            "expire_time_gmt": 1764489180,
            "obs_id": "KOWD",
            "obs_name": "Norwood",
            "valid_time_gmt": 1764481980,
            "day_ind": "N",
            "temp": 23,
            "wx_icon": 33,
            "icon_extd": 3300,
            "wx_phrase": "Fair",
            "pressure_tend": 0,
            "pressure_desc": "Steady",
            "dewPt": 20,
            "heat_index": 23,
            "rh": 88,
            "pressure": 30.46,
            "vis": 10,
            "wc": 23,
            "wdir": null,
            "wdir_cardinal": "CALM",
            "gust": null,
            "wspd": 0,
            "max_temp": null,
            "min_temp": null,
            "precip_total": null,
            "precip_hrly": 0,
            "snow_hrly": null,
            "uv_desc": "Low",
            "feels_like": 23,
            "uv_index": 0,
            "qualifier": null,
            "qualifier_svrty": null,
            "blunt_phrase": null,
            "terse_phrase": null,
            "clds": "CLR",
            "water_temp": null,
            "primary_wave_period": null,
            "primary_wave_height": null,
            "primary_swell_period": null,
            "primary_swell_height": null,
            "primary_swell_direction": null,
            "secondary_swell_period": null,
            "secondary_swell_height": null,
            "secondary_swell_direction": null
        },
        ...
    ]
}
"""

def analyze_weather_data(observations: list):
    """Analyze the historical weather data.

    Compiles daily summaries including minimum, average, and maximum temperatures.

    Args:
        observations (list): A list of weather observation dictionaries.
    
    Returns:
        dict: A summary of the weather data analysis.
    """
    daily_summary = {}
    
    for obs in observations:
        date = datetime.fromtimestamp(obs["valid_time_gmt"]).strftime('%Y-%m-%d')
        temp = obs["temp"]
        
        if date not in daily_summary:
            daily_summary[date] = {
                "min_temp": temp,
                "max_temp": temp,
                "total_temp": temp,
                "count": 1
            }
        else:
            daily_summary[date]["min_temp"] = min(daily_summary[date]["min_temp"], temp)
            daily_summary[date]["max_temp"] = max(daily_summary[date]["max_temp"], temp)
            daily_summary[date]["total_temp"] += temp
            daily_summary[date]["count"] += 1
    
    for date, summary in daily_summary.items():
        summary["avg_temp"] = summary["total_temp"] / summary["count"]
        del summary["total_temp"]
        del summary["count"]
    
    return daily_summary


def average_temp_for_date(observations: list, target_date: str, date_fmt: str = "%Y%m%d", window: int = 5) -> dict:
    """
    Calculate the average high, low, and average temperatures for a given date using the previous 
    `window` days of data (inclusive).

    Args:
        observations (list): List of weather observation dictionaries.
        target_date (str): The target date in 'YYYY-MM-DD' format.
        window (int): Number of days to include in the average (default is 5).

    Returns:
        dict: A dictionary with 'high', 'avg_high', 'avg_avg', 'avg_low', and 'low' temperatures.
    """
    # Group observations by date
    obs_by_date = defaultdict(list)
    for obs in observations:
        if obs["temp"] is not None:
            date_str = datetime.fromtimestamp(obs["valid_time_gmt"]).strftime('%Y-%m-%d')
            obs_by_date[date_str].append(obs["temp"])
            # if date_str == "2024-08-05":
                # print(obs["valid_time_gmt"], obs["temp"])
    # print(f"{obs_by_date=}")

    # Build the list of dates to include in the window
    target_dt = datetime.strptime(target_date, date_fmt)
    dates = [
        (target_dt - timedelta(days=offset)).strftime('%Y-%m-%d')
        for offset in range(window)
    ]
    # print(f"{dates=}")

    highs, lows, avgs = [], [], []
    for date in dates:
        temps = obs_by_date.get(date)
        # print(f"{temps=}")
        if None in temps:
            print(date)
            print(temps)
        if temps:
            highs.append(max(temps))
            avgs.append(sum(temps) / len(temps))
            lows.append(min(temps))

    if highs and lows and avgs:
        return {
            'high': max(highs),
            'avg_high': sum(highs) / len(highs),
            'avg_avg': sum(avgs) / len(avgs),
            'avg_low': sum(lows) / len(lows),
            'low': min(lows)
        }
    else:
        return None

def print_whisker_plot(temp_stats: dict, label: str = ""):
    """
    Print a whisker-plot style visualization of temperature stats using unicode.

    Args:
        temp_stats (dict): Dictionary with keys 'low', 'avg_low', 'avg_avg', 'avg_high', 'high'.
        label (str): Optional label for the plot.

    Example:
        11°F ┌────────◀─────────────●────────▶───────┐ 43°F
                    18.8°F        29.7°F   36.6°F 
    """
    # Unicode characters for the plot
    whisker = "│"
    box_left = "┌"
    box_right = "┐"
    box_mid = "─"
    avg_marker = "●"
    avg_low_marker = "◀"
    avg_high_marker = "▶"

    # Determine the scale
    min_temp = int(temp_stats['low'])
    max_temp = int(temp_stats['high'])
    width = 40  # width of the plot in characters

    def scale(temp):
        # Map temperature to position in the plot
        if max_temp == min_temp:
            return 0
        return int((temp - min_temp) / (max_temp - min_temp) * width)

    # Positions
    pos_low = scale(temp_stats['low'])
    pos_avg_low = scale(temp_stats['avg_low'])
    pos_avg = scale(temp_stats['avg_avg'])
    pos_avg_high = scale(temp_stats['avg_high'])
    pos_high = scale(temp_stats['high'])

    # Build the plot line
    plot = [" "] * (width + 1)
    plot[pos_low] = whisker
    plot[pos_high] = whisker
    for i in range(pos_low + 1, pos_high):
        plot[i] = box_mid
    plot[pos_avg_low] = avg_low_marker
    plot[pos_avg_high] = avg_high_marker
    plot[pos_avg] = avg_marker

    # Add box ends
    plot[pos_low] = box_left
    plot[pos_high] = box_right

    # Compose label line
    label_line = ""
    # label_line = f"{label} " if label else ""
    # label_line += f"{temp_stats['low']}°F"
    label_line += " " * (pos_avg_low - pos_low + 2) if pos_avg_low > pos_low else ""
    label_line += f" {temp_stats['avg_low']:.1f}°F"
    label_line += " " * (pos_avg - pos_avg_low - len(f"{temp_stats['avg_low']:.1f}") - 3) if pos_avg > pos_avg_low else ""
    label_line += f" {temp_stats['avg_avg']:.1f}°F"
    label_line += " " * (pos_avg_high - pos_avg - len(f'{temp_stats["avg_avg"]:.1f}') - 3) if pos_avg_high > pos_avg else ""
    label_line += f" {temp_stats['avg_high']:.1f}°F"
    label_line += " " * (pos_high - pos_avg_high - len(f'{temp_stats["avg_high"]:.1f}') - 3) if pos_high > pos_avg_high else ""
    # label_line += f" {temp_stats['high']}°F"

    print(label)
    print(f"{temp_stats['low']}°F", "".join(plot), f"{temp_stats['high']}°F")
    print(label_line)

if __name__ == "__main__":
    # fetch_weather_data()
    
    # with open("weather-weekly-251201.json", "r") as f:
    #     weather_data = json.load(f)
    
    # observations = weather_data.get("observations", [])
    # summary = analyze_weather_data(observations)
    
    # print("Daily Summary:")
    # for date, stats in summary.items():
    #     print(f"{date}: Max Temp: {stats['max_temp']}°F, Avg Temp: {stats['avg_temp']:.2f}°F, Min Temp: {stats['min_temp']}°F")

    # # Find min, max, and average temperatures of the summarized data
    # all_min_temps = [stats['min_temp'] for stats in summary.values()]
    # all_max_temps = [stats['max_temp'] for stats in summary.values()]
    # all_avg_temps = [stats['avg_temp'] for stats in summary.values()]
    # min_temps = {'min_temp': min(all_min_temps), 'max_temp': max(all_min_temps), 'avg_temp': sum(all_min_temps) / len(all_min_temps)}
    # max_temps = {'min_temp': min(all_max_temps), 'max_temp': max(all_max_temps), 'avg_temp': sum(all_max_temps) / len(all_max_temps)}
    # avg_temps = {'min_temp': min(all_avg_temps), 'max_temp': max(all_avg_temps), 'avg_temp': sum(all_avg_temps) / len(all_avg_temps)}

    # print("\nWeekly Summary:")
    # label, temps = ("Max Temps", max_temps)
    # print(f"{label}: Max Temp: {temps['max_temp']:5d}°F, Avg Temp: {temps['avg_temp']:.2f}°F, Min Temp: {temps['min_temp']:5d}°F")
    # label, temps = ("Avg Temps", avg_temps)
    # print(f"{label}: Max Temp: {temps['max_temp']:.2f}°F, Avg Temp: {temps['avg_temp']:.2f}°F, Min Temp: {temps['min_temp']:.2f}°F")
    # label, temps = ("Min Temps", min_temps)
    # print(f"{label}: Max Temp: {temps['max_temp']:5d}°F, Avg Temp: {temps['avg_temp']:.2f}°F, Min Temp: {temps['min_temp']:5d}°F")


    # # Example: average high, low, and average for 2025-12-05 using previous 5 days
    # avg_temps = average_temp_for_date(observations, "2025-12-05")
    # if avg_temps:
    #     print(f"\n5-day window ending 2025-12-05:")
    #     # print(f"Average High: {avg_temps['avg_high']:.2f}°F")
    #     # print(f"Average Low: {avg_temps['avg_low']:.2f}°F")
    #     # print(f"Average Avg: {avg_temps['avg_avg']:.2f}°F")
    #     print_whisker_plot(avg_temps, label="Temps")
    # else:
    #     print("No data available for the specified window.")

    # Demo 1: Fetch historical weather data
    # key_dates = [
    #     "20240209", "20240214", "20240215", "20240226", "20240227", "20240229", "20240301", "20240304",
    #     "20240306", "20240307", "20240311", "20240312", "20240313", "20240314", "20240315", "20240318",
    #     "20240320", "20240320", "20240321", "20240325", "20240327", "20240329", "20240402", "20240404",
    #     "20240408", "20240410", "20240410", "20240412", "20240416", "20240418", "20240422", "20240424",
    #     "20240426", "20240429", "20240506", "20240507", "20240510", "20240512", "20240515", "20240518",
    #     "20240522", "20240526", "20240530", "20240531", "20240602", "20240606", "20240608", "20240612",
    #     "20240614", "20240615", "20240703", "20240703", "20240704", "20240709", "20240710", "20240711",
    #     "20240713", "20240713", "20240715", "20240716", "20240718", "20240720", "20240723", "20240724",
    #     "20240726", "20240729", "20240801", "20240803", "20240805", "20240807", "20240807", "20240811",
    #     "20240813", "20240815", "20240817", "20240819", "20240821", "20240823", "20240829", "20240904",
    #     "20240907", "20240910", "20240912", "20240914", "20240916", "20240918", "20240921", "20240927",
    #     "20240928", "20240929", "20241001", "20241002", "20241003", "20241005", "20241007", "20241009",
    #     "20241009", "20241010", "20241012", "20241014", "20241015", "20241015", "20241016", "20241017",
    #     "20241017", "20241018", "20241019", "20241021", "20241022", "20241023", "20241024", "20241025",
    #     "20241027", "20241028", "20241029", "20241029", "20241030", "20241101", "20241104", "20241105",
    #     "20241105", "20241106", "20241109", "20241111", "20241112", "20241113", "20241113", "20241114",
    #     "20241115", "20241117", "20241118", "20241118", "20241119", "20241120", "20241121", "20241122",
    #     "20241201", "20241202", "20241202", "20241203", "20241203", "20241204", "20241204", "20241205",
    #     "20241206", "20241208", "20241211", "20241212", "20241213", "20241214", "20241216", "20241216",
    #     "20241217", "20241219", "20241220", "20241222", "20241224", "20241229", "20250102", "20250103",
    #     "20250105", "20250106", "20250107", "20250108", "20250109", "20250111", "20250112", "20250113",
    #     "20250113", "20250114", "20250115", "20250115", "20250116", "20250118", "20250121", "20250122",
    #     "20250123", "20250125", "20250126", "20250127", "20250128", "20250129", "20250130", "20250201",
    #     "20250205", "20250205", "20250208", "20250210", "20250211", "20250212", "20250223", "20250224",
    #     "20250226", "20250228", "20250301", "20250304", "20250306", "20250309", "20250312", "20250313",
    #     "20250316", "20250319", "20250321", "20250323", "20250325", "20250326", "20250328", "20250401",
    #     "20250403", "20250407", "20250409", "20250411", "20250413", "20250416", "20250417", "20250418",
    #     "20250420", "20250422", "20250424", "20250429", "20250501", "20250506", "20250509", "20250511",
    #     "20250514", "20250515", "20250520", "20250522", "20250525", "20250529", "20250601", "20250605",
    #     "20250610", "20250612", "20250617", "20250620", "20250625", "20250628", "20250630", "20250704",
    #     "20250710", "20250714", "20250717", "20250723", "20250729", "20250801", "20250802", "20250802",
    #     "20250804", "20250807", "20250811", "20250814", "20250815", "20250825", "20250828", "20250903",
    #     "20250906", "20250910", "20250914", "20250917", "20250919", "20250923", "20251007", "20251009",
    #     "20251010", "20251010", "20251012", "20251015", "20251017", "20251019", "20251022", "20251024",
    #     "20251027", "20251029", "20251031", "20251103", "20251105", "20251107", "20251120", "20251121",
    #     "20251201", "20251202", "20251203", "20251204", "20251205", "20251207", "20251208", "20251209",
    #     "20251210", "20251212", "20251215", "20251215", "20251216", "20251218", "20251222", "20251224",
    #     "20260102",
    # ]

    date_format = "%m-%d-%Y"
    with open("key_dates.txt", "r") as f:
        key_dates = [line.strip() for line in f if line.strip()]

    weather_data = fetch_weather_data(start_date=key_dates[0], end_date=key_dates[-1], date_fmt=date_format)
    observations = weather_data.get("observations", [])

    for date in key_dates:
        avg_temps = average_temp_for_date(observations, date, date_fmt=date_format)
        if avg_temps:
            # print(f"\n5-day window ending {date}:")
            # print_whisker_plot(avg_temps, label=f"{date}")
            print(f"{date}: {avg_temps['low']} {avg_temps['avg_low']:.2f} {avg_temps['avg_avg']:.2f} {avg_temps['avg_high']:.2f} {avg_temps['high']}")
        else:
            print(f"No data available for the specified window ending {date}.")
