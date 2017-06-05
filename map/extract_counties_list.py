import json

with open('us.json') as f :
	data = json.load(f)
  
	for obj in data['objects']['us_counties']['geometries'] :
		print obj['properties']['COUNTY'], ',', obj['properties']['NAME'].encode('utf-8')
