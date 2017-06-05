import random

print 'FIPS,population'
with open('counties.csv') as f :
	i = False
	for line in f :
		if i :
			print line[0:3],',',int(random.random()*100)
		else :
			i = True