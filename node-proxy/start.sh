#!/bin/sh

# 解析环境变量 ALIST_HOST
IFS=':' read -ra ADDR <<< "$ALIST_HOST"
SERVER_HOST=${ADDR[0]}
SERVER_PORT=${ADDR[1]}

# 更新 config.js 文件
sed -i "s/serverHost: '.*'/serverHost: '$SERVER_HOST'/" /node-proxy/src/config.js
sed -i "s/serverPort: .*/serverPort: $SERVER_PORT,/" /node-proxy/src/config.js

# 启动原有的命令
exec "$@"
