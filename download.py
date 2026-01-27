import urllib.request
url = "https://nguyenbatyads37.github.io/static-html-show-data/Vandonsale.html"
try:
    urllib.request.urlretrieve(url, "temp_vandonsale.html")
    print("Done")
except Exception as e:
    print(e)
