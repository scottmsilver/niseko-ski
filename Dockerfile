FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY app.js /usr/share/nginx/html/app.js
COPY yotei.png /usr/share/nginx/html/yotei.png
COPY trail-map.jpg /usr/share/nginx/html/trail-map.jpg
COPY data/ /usr/share/nginx/html/data/
EXPOSE 80
