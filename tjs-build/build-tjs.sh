#!/bin/sh
# ============================================================================
# tjs 双二进制一键构建（glibc 主力 + musl 兜底）
#
# 背景：官方无 Linux 二进制，且 max_http_body_size 补丁必须自编译；
#       musl 全静态无法 dlopen（musl 硬限制）→ 双二进制，详见 manifest.txt。
#
# 用法：
#   ./build-tjs.sh                       # 完整流程（工具链/源码缺失自动下载）
#
# 环境变量（均有默认值，指向持久目录可避免重启后重下）：
#   TOOLS_DIR    工具链目录          默认 /tmp/tools
#   SRC_DIR      txiki.js 源码目录   默认 /tmp/txiki.js
#   FFI_PREFIX   libffi 安装前缀     默认 /tmp/ffi-musl
#   DL_CACHE     下载缓存目录        默认 /tmp
#
# 产物：dist/tjs-musl、dist/tjs-glibc（不进 git），哈希写入 manifest.txt
# 冒烟：verify.mjs 双跑（musl 预期 ffi=unavailable，glibc 预期 ffi=ok）
# ============================================================================
set -eu

# ---- 钉住的版本（升级需评审：产物哈希会变化，金样必须重跑）----
TJS_REPO_URL=https://github.com/saghul/txiki.js
TJS_COMMIT=fc2b5f3b2d09e6db739eb619cfb1acca37d6bdf0   # v26.6.0 补丁基线
ZIG_VER=0.13.0
CMAKE_VER=3.31.6
NINJA_VER=1.12.1
LIBFFI_VER=3.4.6
# WAMR 必须显式指定平台/目标，否则 cmake ABI 探测挂死（Phase 0 实测）

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR=${TOOLS_DIR:-/tmp/tools}
SRC_DIR=${SRC_DIR:-/tmp/txiki.js}
FFI_PREFIX=${FFI_PREFIX:-/tmp/ffi-musl}
DL_CACHE=${DL_CACHE:-/tmp}

ZIG_DIR="$TOOLS_DIR/zig-linux-x86_64-$ZIG_VER"
CMAKE_DIR="$TOOLS_DIR/cmake-$CMAKE_VER-linux-x86_64"

# 补丁集（顺序敏感）：
#   0001 顶层 src/httpserver.c      —— lws 请求体上限 100MiB → 1TiB
#   0002 deps/libwebsockets 子模块  —— lextable 扩展 WebDAV 方法（PROPFIND/MKCOL/COPY/MOVE/
#                                      PROPPATCH/LOCK/UNLOCK），含枚举/词表/方法数组/生成器
#   0003 顶层 src/httpserver.c      —— tjs 侧方法名映射（LWSHUMETH 扩展 + NULL 兜底）
PATCH_LIST="0001-lift-lws-body-cap.patch:.:src/httpserver.c:max_http_body_size = 1ULL << 40
0002-lws-webdav-methods.patch:deps/libwebsockets:lib/roles/http/lextable-strings.h:propfind
0003-tjs-webdav-method-names.patch:.:src/httpserver.c:LWSHUMETH_PROPFIND"

log()  { printf '[build-tjs] %s\n' "$*"; }
die()  { printf '[build-tjs] FATAL: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

fetch() { # fetch <url> <out-file>
  if have curl; then
    curl -fL --retry 3 -o "$2" "$1"
  elif have wget; then
    wget -q -O "$2" "$1"
  else
    die '需要 curl 或 wget'
  fi
}

unzip_to() { # unzip_to <zip> <target-dir>（环境无 unzip，用 python3 兜底）
  if have unzip; then
    unzip -o -q "$1" -d "$2"
  elif have python3; then
    python3 -m zipfile -e "$1" "$2"
  else
    die '解压 zip 需要 unzip 或 python3'
  fi
}

# ---- 1. 工具链 ----
install_wrappers() {
  mkdir -p "$TOOLS_DIR/bin"
  for w in zig-cc zig-cxx zig-cc-gnu zig-cxx-gnu; do
    cp "$REPO_DIR/wrappers/$w" "$TOOLS_DIR/bin/$w"
    chmod +x "$TOOLS_DIR/bin/$w"
  done
}

ensure_zig() {
  [ -x "$ZIG_DIR/zig" ] && { log "zig $ZIG_VER 已存在"; return 0; }
  log "下载 zig $ZIG_VER ..."
  fetch "https://ziglang.org/download/$ZIG_VER/zig-linux-x86_64-$ZIG_VER.tar.xz" \
    "$DL_CACHE/zig-linux-x86_64-$ZIG_VER.tar.xz"
  tar -xJf "$DL_CACHE/zig-linux-x86_64-$ZIG_VER.tar.xz" -C "$TOOLS_DIR"
  [ -x "$ZIG_DIR/zig" ] || die "zig 解压失败"
}

ensure_cmake() {
  [ -x "$CMAKE_DIR/bin/cmake" ] && { log "cmake $CMAKE_VER 已存在"; return 0; }
  log "下载 cmake $CMAKE_VER ..."
  fetch "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VER/cmake-$CMAKE_VER-linux-x86_64.tar.gz" \
    "$DL_CACHE/cmake-$CMAKE_VER-linux-x86_64.tar.gz"
  tar -xzf "$DL_CACHE/cmake-$CMAKE_VER-linux-x86_64.tar.gz" -C "$TOOLS_DIR"
  [ -x "$CMAKE_DIR/bin/cmake" ] || die "cmake 解压失败"
}

ensure_ninja() {
  [ -x "$TOOLS_DIR/bin/ninja" ] && { log "ninja 已存在"; return 0; }
  log "下载 ninja $NINJA_VER ..."
  fetch "https://github.com/ninja-build/ninja/releases/download/v$NINJA_VER/ninja-linux.zip" \
    "$DL_CACHE/ninja-linux.zip"
  unzip_to "$DL_CACHE/ninja-linux.zip" "$TOOLS_DIR/bin"
  chmod +x "$TOOLS_DIR/bin/ninja"
}

find_make() {
  if have make; then echo make
  elif [ -x "$TOOLS_DIR/bin/make" ]; then echo "$TOOLS_DIR/bin/make"
  else die '找不到 make（libffi 编译需要）'
  fi
}

# ---- 2. libffi（txiki 唯一非 vendored 依赖；musl 目标静态库）----
ensure_libffi() {
  [ -f "$FFI_PREFIX/lib/libffi.a" ] && { log "libffi 已存在"; return 0; }
  log "构建 libffi $LIBFFI_VER (musl) ..."
  mkdir -p "$TOOLS_DIR"
  fetch "https://github.com/libffi/libffi/releases/download/v$LIBFFI_VER/libffi-$LIBFFI_VER.tar.gz" \
    "$DL_CACHE/libffi-$LIBFFI_VER.tar.gz"
  tar -xzf "$DL_CACHE/libffi-$LIBFFI_VER.tar.gz" -C "$TOOLS_DIR"
  FFI_SRC="$TOOLS_DIR/libffi-$LIBFFI_VER"
  ( cd "$FFI_SRC" &&
    ./configure \
      --enable-builddir=x86_64-unknown-linux-musl \
      --host=x86_64-unknown-linux-musl \
      --enable-static --disable-shared --disable-docs \
      --prefix="$FFI_PREFIX" \
      CC="$TOOLS_DIR/bin/zig-cc" &&
    "$(find_make)" -j "$(nproc 2>/dev/null || echo 4)" &&
    "$(find_make)" install ) || die 'libffi 构建失败'
  [ -f "$FFI_PREFIX/lib/libffi.a" ] || die 'libffi 安装产物缺失'
}

# ---- 3. txiki.js 源码 + 补丁 ----
apply_patch() { # apply_patch <patch-file> <subdir> <marker-file> <marker-string>
  PNAME=$1; PSUB=$2; PMARKER_FILE=$3; PMARKER=$4
  PF="$REPO_DIR/patches/$PNAME"
  if [ "$PSUB" = "." ]; then
    PWORK="$SRC_DIR"; PMARKER_PATH="$SRC_DIR/$PMARKER_FILE"
  else
    PWORK="$SRC_DIR/$PSUB"; PMARKER_PATH="$PWORK/$PMARKER_FILE"
  fi
  [ -f "$PF" ] || die "补丁文件缺失: $PF"
  if ( cd "$PWORK" && git apply --check "$PF" 2>/dev/null ); then
    log "应用补丁 $PNAME（$PSUB）"
    ( cd "$PWORK" && git apply "$PF" ) || die "补丁 $PNAME 应用失败"
  elif grep -q "$PMARKER" "$PMARKER_PATH"; then
    log "补丁 $PNAME 已应用，跳过"
  else
    die "补丁 $PNAME 无法应用（源码既无补丁也无痕迹）"
  fi
}

# 0002 改动了 lextable 词表与生成器，须用 minilex.c 重新生成 lextable.h
regen_lextable() {
  LWS_HTTP_DIR="$SRC_DIR/deps/libwebsockets/lib/roles/http"
  grep -q 'propfind' "$LWS_HTTP_DIR/lextable-strings.h" 2>/dev/null || return 0
  # 临时产物写 TOOLS_DIR，避免污染源码树（minilex 的 "-" 输出陷阱与日志残留）
  TMP_MINILEX="$TOOLS_DIR/.minilex"
  TMP_LEXTABLE="$TOOLS_DIR/.lextable.h.new"
  TMP_MINILEX_LOG="$TOOLS_DIR/.minilex.log"
  log "重生成 lextable.h ..."
  "$ZIG_BIN" cc -O2 "$LWS_HTTP_DIR/minilex.c" -o "$TMP_MINILEX" \
    || die "minilex.c 编译失败"
  ( cd "$LWS_HTTP_DIR" && "$TMP_MINILEX" > "$TMP_LEXTABLE" \
      2> "$TMP_MINILEX_LOG" ) || die "minilex 生成失败（见 $TMP_MINILEX_LOG）"
  mv "$TMP_LEXTABLE" "$LWS_HTTP_DIR/lextable.h"
  rm -f "$TMP_MINILEX"
  log "lextable.h 已重生成（$(wc -l < "$LWS_HTTP_DIR/lextable.h") 行）"
}

ensure_source() {
  if [ ! -d "$SRC_DIR/.git" ]; then
    log "克隆 txiki.js ..."
    git clone "$TJS_REPO_URL" "$SRC_DIR"
  fi
  cd "$SRC_DIR"
  CURRENT=$(git rev-parse HEAD)
  if [ "$CURRENT" != "$TJS_COMMIT" ]; then
    [ -z "$(git status --porcelain)" ] || \
      die "SRC_DIR HEAD=$CURRENT 与钉住 commit 不一致且工作区不干净，请人工处理或删除 $SRC_DIR"
    git fetch origin "$TJS_COMMIT"
    git checkout -q "$TJS_COMMIT"
  fi
  # submodule 6 个：libuv/libwebsockets/mbedtls/mimalloc/quickjs/wamr
  git submodule update --init --recursive
  # 应用补丁（幂等：已打则跳过）
  while IFS=: read -r name subdir marker_file marker; do
    [ -n "$name" ] || continue
    apply_patch "$name" "$subdir" "$marker_file" "$marker"
  done <<PATCH_EOF
$PATCH_LIST
PATCH_EOF
  regen_lextable
}

# ---- 4. 双二进制构建 ----
build_one() { # build_one <build-subdir> <cc> <cxx> <ldflags>
  BUILD_SUBDIR=$1; CC_NAME=$2; CXX_NAME=$3; LDFLAGS=$4
  B="$SRC_DIR/$BUILD_SUBDIR"
  log "构建 $BUILD_SUBDIR (CC=$CC_NAME LDFLAGS='$LDFLAGS') ..."
  cmake -G Ninja \
    -B "$B" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER="$TOOLS_DIR/bin/$CC_NAME" \
    -DCMAKE_CXX_COMPILER="$TOOLS_DIR/bin/$CXX_NAME" \
    -DCMAKE_EXE_LINKER_FLAGS="$LDFLAGS" \
    -DFFI_LIB="$FFI_PREFIX/lib/libffi.a" \
    -DFFI_INCLUDE_DIR="$FFI_PREFIX/include" \
    -DWAMR_BUILD_PLATFORM=linux \
    -DWAMR_BUILD_TARGET=X86_64 \
    "$SRC_DIR"
  cmake --build "$B" --parallel "$(nproc 2>/dev/null || echo 4)"
  [ -x "$B/tjs" ] || die "$BUILD_SUBDIR 构建产物缺失"
}

# ---- 5. 产物落盘 + 冒烟 + manifest ----
finalize() {
  # cmake 的 CXX-DetectStdlib 探测会把预处理结果写成源码树根下的 "-"，收尾清掉
  rm -f "$SRC_DIR/-"
  mkdir -p "$REPO_DIR/dist"
  for p in musl:build glibc:build-glibc; do
    name=${p%%:*}; subdir=${p##*:}
    old_hash='(无基线)'
    [ -f "$REPO_DIR/dist/tjs-$name" ] && old_hash=$(sha256sum "$REPO_DIR/dist/tjs-$name" | cut -d' ' -f1)
    cp "$SRC_DIR/$subdir/tjs" "$REPO_DIR/dist/tjs-$name"
    new_hash=$(sha256sum "$REPO_DIR/dist/tjs-$name" | cut -d' ' -f1)
    if [ "$old_hash" != "$new_hash" ] && [ "$old_hash" != '(无基线)' ]; then
      log "WARN: tjs-$name 哈希变化（重建非逐字节可重现），金样测试须重跑"
    fi
    log "tjs-$name  sha256=$new_hash"
  done

  MUSL_OUT=$("$REPO_DIR/dist/tjs-musl" run "$REPO_DIR/verify.mjs") || die "musl 冒烟异常: $MUSL_OUT"
  log "musl  冒烟: $MUSL_OUT"
  case "$MUSL_OUT" in
    *VERIFY-PASS*ffi=unavailable*) : ;;
    *) die "musl 冒烟断言失败（预期 ffi=unavailable）" ;;
  esac
  GLIBC_OUT=$("$REPO_DIR/dist/tjs-glibc" run "$REPO_DIR/verify.mjs") || die "glibc 冒烟异常: $GLIBC_OUT"
  log "glibc 冒烟: $GLIBC_OUT"
  case "$GLIBC_OUT" in
    *VERIFY-PASS*ffi=ok*) : ;;
    *) die "glibc 冒烟断言失败（预期 ffi=ok）" ;;
  esac

  MUSL_HASH=$(sha256sum "$REPO_DIR/dist/tjs-musl" | cut -d' ' -f1)
  GLIBC_HASH=$(sha256sum "$REPO_DIR/dist/tjs-glibc" | cut -d' ' -f1)
  {
    echo '# tjs 双二进制构建清单（build-tjs.sh 构建后自动更新本文件）'
    echo '#'
    echo '# 产物用途：'
    echo '#   tjs-glibc  主力 —— zig cc x86_64-linux-gnu（glibc 2.17 基线），可 dlopen 系统'
    echo '#              libcrypto/libnettle，chacha20 FFI 路径（EVP 978MB/s）可用'
    echo '#   tjs-musl   兜底 —— zig cc x86_64-linux-musl 全静态，单文件任意 Linux 可跑，'
    echo '#              dlopen 不可用（musl 硬限制），自动降级纯 JS chacha20'
    echo '# 验证基线：node-proxy/bench/ffi-crypto-bench.mjs 双跑通过（2026-10-25）'
    echo '#'
    echo "# 源码钉住：github.com/saghul/txiki.js @ $TJS_COMMIT (v26.6.0)"
    echo '# 补丁集：  patches/0001-lift-lws-body-cap.patch（1 行：lws 100MiB body 上限 → 1TiB）'
    echo '#           patches/0002-lws-webdav-methods.patch（lextable 扩展 WebDAV 方法）'
    echo '#           patches/0003-tjs-webdav-method-names.patch（tjs 方法名映射）'
    echo "# 工具链：  zig $ZIG_VER / cmake $CMAKE_VER / ninja $NINJA_VER / libffi $LIBFFI_VER（musl 静态）"
    echo '#'
    echo "## 构建时间 $(date '+%Y-%m-%d %H:%M:%S')，verify.mjs 冒烟 PASS"
    echo "sha256  tjs-musl   $MUSL_HASH"
    echo "sha256  tjs-glibc  $GLIBC_HASH"
  } > "$REPO_DIR/manifest.txt"
  log "manifest.txt 已更新"
}

main() {
  [ -d "$REPO_DIR/patches" ] || die "补丁目录缺失: $REPO_DIR/patches"
  mkdir -p "$TOOLS_DIR"
  install_wrappers
  ensure_zig
  ensure_cmake
  ensure_ninja
  ZIG_BIN="$ZIG_DIR/zig"
  export ZIG_BIN
  export PATH="$TOOLS_DIR/bin:$CMAKE_DIR/bin:$PATH"
  ensure_libffi
  ensure_source
  build_one build zig-cc zig-cxx '-static'
  build_one build-glibc zig-cc-gnu zig-cxx-gnu ''
  finalize
  log '全部完成：dist/tjs-musl + dist/tjs-glibc'
}

main
