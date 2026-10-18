FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /opt/beforeyou
RUN npm install --omit=dev --save-exact playwright@1.64.1
COPY browser.mjs /opt/beforeyou/browser.mjs
USER pwuser
