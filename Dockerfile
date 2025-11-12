# Usa a imagem correta com o Playwright já instalado
FROM apify/actor-node-playwright:20

# Copia os arquivos do projeto
COPY . ./

# Instala as dependências
RUN npm install --omit=dev

# Define o comando padrão
CMD ["npm", "start"]
