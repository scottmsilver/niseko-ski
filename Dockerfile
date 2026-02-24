FROM node:20-slim

# Install chromium, nginx, supervisor, and tini
RUN apt-get update && apt-get install -y \
    chromium nginx supervisor tini \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Copy static files
COPY index.html style.css app.js /usr/share/nginx/html/
COPY yotei.png trail-map.jpg /usr/share/nginx/html/
COPY data/ /usr/share/nginx/html/data/

# Copy scraper
WORKDIR /app/scraper
COPY scraper/package.json .
RUN npm install --production
COPY scraper/index.js scraper/display.js ./

# Copy supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80
ENTRYPOINT ["tini", "--"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
