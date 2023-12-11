FROM node:gallium-alpine
WORKDIR /node-proxy

# 复制项目文件到容器
COPY node-proxy/ /node-proxy

# 给启动脚本执行权限
RUN chmod +x /node-proxy/docker_start.sh

# 设置时区
RUN rm -rf /etc/localtime && ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 暴露端口
EXPOSE 5344

# 设置容器启动时执行的命令
ENTRYPOINT ["/node-proxy/docker_start.sh"]
CMD ["node", "index.js"]
