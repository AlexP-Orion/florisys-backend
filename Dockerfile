FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Expone los dos puertos que usaremos
EXPOSE 3000 8000

CMD ["node", "index.js"]