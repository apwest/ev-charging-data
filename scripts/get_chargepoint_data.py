"""
    data['charging_activity_monthly']['month_info'][0]['sessions'][1]['current_charging'] := (
        'in_use',
        'done'
    )
"""
import getpass
import os
from datetime import datetime, timedelta
from python_chargepoint import ChargePoint


def format_timestamp(timestamp, format="%Y-%m-%d %-I:%M:%S %p %Z"):
    """Convert the timestamp to a formatted string."""
    # Example: 2024-05-06 7:32:59 AM EDT
    dt = datetime.fromtimestamp(timestamp)
    return dt.astimezone().strftime(format)


def format_duration(seconds):
    td = timedelta(seconds=seconds)
    return str(td)


def get_date(ts):
    dt = datetime.fromtimestamp(ts/1e3) # ts is given in milliseconds
    return dt.strftime("%m-%d-%Y")


# Date	Network	Station ID	Station Energy	Start Time	Finish Time	Duration	Energy (kWh)	Total (USD)	Miles	Avg. Cost (¢/mi)
def get_session_summary(session):
    date = get_date(session.get('billing_time'))
    network = "Charge Point"
    station_id = f"CP{session.get('device_id')}"
    station_power = "6.6 kW AC"
    # All times are given in milliseconds, but helper functions expect seconds
    start_time = format_timestamp(session.get('start_time') / 1e3)
    end_time = format_timestamp(session.get('end_time') / 1e3)
    duration = format_duration(session.get('session_time') / 1e3)
    energy = session.get('energy_kwh')
    total_cost = session.get('total_amount')
    miles = 0.0
    avg_cost = miles / total_cost if total_cost > 0.0 else 0.0
    return [date, network, station_id, station_power, start_time, end_time, duration, energy, total_cost, miles, avg_cost]

# https://mc.chargepoint.com/map-prod/v3/station/info?deviceId=4338611

def transform(x: bytes, k: int) -> bytes:
    return bytes([a ^ k for a in x])
    

if __name__ == '__main__':
    _user = "apwest@gmail.com"
    _ciph = os.getenv("CHARGEPOINT_CYPHER")
    _pass = getpass.getpass("Enter Charge Point password or cipher key:")
    if _ciph:
        _pass = transform(_ciph, int(_pass)).decode()

    print("[i] Connecting to Charge Point...")
    cli = ChargePoint(_user, _pass)

    print("[i] Requesting charging activity...")
    # request = {"charging_activity_monthly": {"page_size": 50, "show_address_for_home_sessions": True}}
    request = {"charging_activity": {"page_size": 50, "page_offset": "p_2025-07_1752704568000_4248426721"}}
    request = {"charging_activity": {"page_size": 60}}
    response = cli._session.post(f'{cli._global_config.endpoints.mapcache}v2', json=request)
    print(response)
    data = response.json()
    print("[i] Received charging activity...")
    print("Offet:", data['charging_activity']['page_offset'])

    # sessions = data['charging_activity_monthly']['month_info'][1]['sessions']
    # print(data['charging_activity']['page_offset'])
    sessions = data['charging_activity']['session_info']

    for session in sessions[::-1]:
        if session['current_charging'] == 'done':
            print(", ".join(str(x) for x in get_session_summary(session)))


    # sessions = data['charging_activity_monthly']['month_info'][0]['sessions']
    # for session in sessions[::-1]:
    #     if session['current_charging'] == 'done':
    #         print(", ".join(str(x) for x in get_session_summary(session)))
