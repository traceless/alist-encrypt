/**
 * ChaCha20 WASM 内核（对齐 node-proxy/src/utils/chacha20.js 完整语义）
 *
 * 语义要点：
 *   - state = 常量 4 + key 8（LE 组装）+ counter 1 + nonce 3（LE）
 *   - _block()：counter 先 ++，归零时 nonce[2]++（256G 进位）；keystream 64B，buf_pos=0
 *   - update：逐字节 if(buf_pos%64==0) block(); out^=keystream[buf_pos++]
 *   - seek(pos)：counter = floor(pos/64)+1，空跑 pos%64 字节（等价 setPosition）
 *
 * 全部导出 i32 参数（WAMR JS 绑定避免 i64/BigInt）。
 */

#define BUF_SIZE (1024 * 1024)

static unsigned int st_key[8];
static unsigned int st_nonce[3];
static unsigned int st_counter;
static int cc_buf_pos;
static unsigned char keystream[64];

static unsigned char shared_buf[BUF_SIZE];

static unsigned int rotl(unsigned int v, int n) { return (v << n) | (v >> (32 - n)); }

static void qr(unsigned int *x, int a, int b, int c, int d) {
  x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 16);
  x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 12);
  x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 8);
  x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 7);
}

static void le_bytes_to_u32(const unsigned char *buf, unsigned int *out, int n) {
  for (int i = 0; i < n; i++) {
    out[i] = (unsigned int)buf[i * 4] | ((unsigned int)buf[i * 4 + 1] << 8) |
             ((unsigned int)buf[i * 4 + 2] << 16) | ((unsigned int)buf[i * 4 + 3] << 24);
  }
}

static void u32_to_le_bytes(const unsigned int *in, unsigned char *buf, int n) {
  for (int i = 0; i < n; i++) {
    int pos = i * 4;
    buf[pos] = (unsigned char)(in[i] & 0xff);
    buf[pos + 1] = (unsigned char)((in[i] >> 8) & 0xff);
    buf[pos + 2] = (unsigned char)((in[i] >> 16) & 0xff);
    buf[pos + 3] = (unsigned char)((in[i] >> 24) & 0xff);
  }
}

static void block(void) {
  unsigned int st[16], x[16];
  st[0] = 0x61707865; st[1] = 0x3320646e; st[2] = 0x79622d32; st[3] = 0x6b206574;
  for (int i = 0; i < 8; i++) st[4 + i] = st_key[i];
  st[12] = st_counter;
  for (int i = 0; i < 3; i++) st[13 + i] = st_nonce[i];
  /* JS: this.counter = (this.counter + 1) >>> 0; if (this.counter == 0) nonce[2]++ */
  st_counter = st_counter + 1;
  if (st_counter == 0) st_nonce[2] = st_nonce[2] + 1;
  for (int i = 0; i < 16; i++) x[i] = st[i];
  for (int r = 0; r < 10; r++) {
    qr(x, 0, 4, 8, 12);
    qr(x, 1, 5, 9, 13);
    qr(x, 2, 6, 10, 14);
    qr(x, 3, 7, 11, 15);
    qr(x, 0, 5, 10, 15);
    qr(x, 1, 6, 11, 12);
    qr(x, 2, 7, 8, 13);
    qr(x, 3, 4, 9, 14);
  }
  for (int i = 0; i < 16; i++) x[i] = x[i] + st[i];
  u32_to_le_bytes(x, keystream, 16);
  cc_buf_pos = 0;
}

/* key: 32 字节，nonce: 12 字节 */
void __attribute__((export_name("cc20_init"))) cc20_init(int key_ptr, int nonce_ptr, int counter) {
  const unsigned char *kp = (const unsigned char *)(long)key_ptr;
  const unsigned char *np = (const unsigned char *)(long)nonce_ptr;
  le_bytes_to_u32(kp, st_key, 8);
  le_bytes_to_u32(np, st_nonce, 3);
  st_counter = (unsigned int)counter;
  cc_buf_pos = 0;
}

/* 定位到绝对字节位置 pos（等价 setPosition） */
void __attribute__((export_name("cc20_seek"))) cc20_seek(int pos) {
  st_counter = (unsigned int)(pos / 64 + 1);
  cc_buf_pos = 0;
  int n = pos % 64;
  /* 等价 JS: update(零字节数组 pos%64) —— 空跑 keystream */
  for (int k = 0; k < n; k++) {
    if (cc_buf_pos % 64 == 0) block();
    cc_buf_pos++;
  }
}

/* 加解密（原地异或）。返回处理字节数 */
int __attribute__((export_name("cc20_crypt"))) cc20_crypt(int buf_ptr, int len) {
  unsigned char *buf = (unsigned char *)(long)buf_ptr;
  for (int k = 0; k < len; k++) {
    if (cc_buf_pos % 64 == 0) block();
    buf[k] ^= keystream[cc_buf_pos];
    cc_buf_pos++;
  }
  return len;
}

int __attribute__((export_name("cc20_buf_ptr"))) cc20_buf_ptr(void) { return (int)(long)shared_buf; }
int __attribute__((export_name("cc20_buf_size"))) cc20_buf_size(void) { return BUF_SIZE; }
