import mnis
import datetime
import os.path

# Download data on current MPs into members.csv
if not os.path.isfile("members_today.csv"):
	mnis.downloadMembers(datetime.date.today(), 'members_today.csv')

# Download data on MPs serving on 6 May 2005 into members.csv
if not os.path.isfile("members_2005.csv"):
	mnis.downloadMembers(datetime.date(2005, 6, 6), 'members_2005.csv')

# Download data on MPs serving on 7 May 2010 into members.csv
if not os.path.isfile("members_2010.csv"):
	mnis.downloadMembers(datetime.date(2010, 6, 7), 'members_2010.csv')

# Download data on MPs serving on 8 May 2015 into members.csv
if not os.path.isfile("members_2015.csv"):
	mnis.downloadMembers(datetime.date(2015, 6, 8), 'members_2015.csv')