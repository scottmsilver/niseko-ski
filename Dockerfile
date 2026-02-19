FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY trail-map.jpg /usr/share/nginx/html/trail-map.jpg
EXPOSE 80
