import importlib.util, json, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('school_calendar',Path(__file__).resolve().parents[1]/'generate_school_calendar_2026_2027.py')
m=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=m
spec.loader.exec_module(m)
events=m.merge_consecutive_single_day_events(sorted(m.build_events(m.rows_from_sheet(Path(sys.argv[1]))),key=m.sort_key))
print(json.dumps([e.to_dict(i+1) for i,e in enumerate(events)],ensure_ascii=False))
