FROM node:gallium-alpine
WORKDIR /node-proxy
COPY node-proxy/dist /node-proxy
COPY start.sh /start.sh
RUN chmod +x /start.sh
RUN rm -rf /etc/localtime && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
EXPOSE 5344
ENTRYPOINT ["/start.sh"]
CMD ["node", "index.js"]
