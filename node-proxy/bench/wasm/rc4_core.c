/**
 * RC4 WASM 内核（对齐 node-proxy/src/utils/rc4Md5.js 完整语义）
 *
 * 语义要点（与 JS 参考实现逐字节一致）：
 *   - resetKSA：offset = floor(position/1e6)*1e6，BE int32 XOR 进 key 尾 4 字节，重跑 KSA，i=j=0
 *   - PRGA 过程中 position 每到 1e6 倍数即 reset（继续从 i=j=0 开始）
 *   - seek(pos)：resetKSA(pos) 后空跑 pos%1e6 次 PRGA 步（不写数据、不推进 position）
 *
 * 共享缓冲协议：JS 通过 cc20 同款 buf_ptr() 取数据区指针，写入后调 crypt(buf, len)。
 * 所有导出函数只用 i32 参数（WAMR JS 绑定避免 i64/BigInt 兼容问题）。
 */

#define SEGMENT 1000000
#define BUF_SIZE (1024 * 1024)

static unsigned char rc4_key[20];
static int rc4_key_len;
static unsigned char sbox[256];
static int s_i, s_j;
static long long position;

static unsigned char shared_buf[BUF_SIZE];

static void init_ksa(const unsigned char *key, int len) {
  int K[256];
  for (int i = 0; i < 256; i++) sbox[i] = (unsigned char)i;
  for (int i = 0; i < 256; i++) K[i] = key[i % len];
  int j = 0;
  for (int i = 0; i < 256; i++) {
    j = (j + sbox[i] + K[i]) % 256;
    unsigned char temp = sbox[i];
    sbox[i] = sbox[j];
    sbox[j] = temp;
  }
  s_i = 0;
  s_j = 0;
}

static void reset_ksa(long long pos) {
  long long offset = (pos / SEGMENT) * SEGMENT;
  unsigned char k[20];
  for (int x = 0; x < rc4_key_len; x++) k[x] = rc4_key[x];
  /* 等价 JS: buf.writeInt32BE(offset)（大端低 32 位），测试范围内 offset < 2^31 */
  unsigned int off32 = (unsigned int)(offset & 0xFFFFFFFFLL);
  unsigned char b[4];
  b[0] = (unsigned char)((off32 >> 24) & 0xff);
  b[1] = (unsigned char)((off32 >> 16) & 0xff);
  b[2] = (unsigned char)((off32 >> 8) & 0xff);
  b[3] = (unsigned char)(off32 & 0xff);
  int j = rc4_key_len - 4;
  for (int x = 0; x < 4; x++, j++) k[j] ^= b[x];
  init_ksa(k, rc4_key_len);
}

/* key: 原始 rc4Key（hex 解码后 16 字节，未 XOR offset） */
void __attribute__((export_name("rc4_set_key"))) rc4_set_key(int key_ptr, int key_len) {
  const unsigned char *p = (const unsigned char *)(long)key_ptr;
  if (key_len > 20) key_len = 20;
  for (int x = 0; x < key_len; x++) rc4_key[x] = p[x];
  rc4_key_len = key_len;
}

/* 定位到绝对字节位置 pos（等价 setPosition：resetKSA + PRGAExecPostion） */
void __attribute__((export_name("rc4_seek"))) rc4_seek(int pos) {
  position = pos;
  reset_ksa(pos);
  int n = (int)(pos % SEGMENT);
  /* PRGAExecPostion：空跑 n 步，只推进 i/j */
  for (int k = 0; k < n; k++) {
    s_i = (s_i + 1) % 256;
    s_j = (s_j + sbox[s_i]) % 256;
    unsigned char temp = sbox[s_i];
    sbox[s_i] = sbox[s_j];
    sbox[s_j] = temp;
  }
}

/* 加解密（原地异或），含 segment 边界 reset。返回处理字节数 */
int __attribute__((export_name("rc4_crypt"))) rc4_crypt(int buf_ptr, int len) {
  unsigned char *buf = (unsigned char *)(long)buf_ptr;
  unsigned char *S = sbox;
  int i = s_i, j = s_j;
  for (int k = 0; k < len; k++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    unsigned char temp = S[i];
    S[i] = S[j];
    S[j] = temp;
    buf[k] ^= S[(S[i] + S[j]) % 256];
    if (++position % SEGMENT == 0) {
      reset_ksa(position);
      i = s_i; /* initKSA 置 0 */
      j = s_j;
      S = sbox;
    }
  }
  s_i = i;
  s_j = j;
  return len;
}

int __attribute__((export_name("rc4_buf_ptr"))) rc4_buf_ptr(void) { return (int)(long)shared_buf; }
int __attribute__((export_name("rc4_buf_size"))) rc4_buf_size(void) { return BUF_SIZE; }
