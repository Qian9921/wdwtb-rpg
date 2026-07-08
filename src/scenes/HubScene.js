import Phaser from 'phaser';

// HubScene：职业选择大厅。玩家捏完人后选职业进入体验。
// 职业列表暂时硬编码，以后可挪到 data/ 目录的 JSON。
export class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    const careers = [
      // 深度职业（3 个）—— 金边 + 亮色填充
      { key: 'programmer',  name: '程序员',     desc: '代码会跑，人也会累',           deep: true },
      { key: 'product',     name: '产品经理',   desc: '夹在所有人的期待中间',         deep: true },
      { key: 'admin',       name: '高校行政',   desc: '安稳的背面是什么',             deep: true },
      // 轻量职业（7 个）
      { key: 'designer',    name: '设计师',     desc: '美是秩序，也是自由的呼吸',     deep: false },
      { key: 'operation',   name: '运营',       desc: '数据背后，是无数真实的人',     deep: false },
      { key: 'teacher',     name: '教师',       desc: '每一颗种子都有它的季节',       deep: false },
      { key: 'doctor',      name: '医生／护士', desc: '疲惫中藏着最深的善意',         deep: false },
      { key: 'civilservant',name: '公务员',     desc: '规则之内，亦有温度',           deep: false },
      { key: 'sales',       name: '销售',       desc: '每一单背后都有一段对话',       deep: false },
      { key: 'lawyer',      name: '律师',       desc: '天平的两端，哪边更重',         deep: false },
    ];

    // 标题
    this.add.text(480, 50, '你想成为谁？', {
      fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5);
    this.add.text(480, 85, '选择一个职业，开始你的职场故事', {
      fontSize: '15px', color: '#9aa0a6',
    }).setOrigin(0.5);

    // 左上角返回按钮
    const back = this.add.text(24, 16, '← 返回', {
      fontSize: '15px', color: '#9aa0a6',
    }).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#ffd24d'));
    back.on('pointerout', () => back.setColor('#9aa0a6'));
    back.on('pointerdown', () => this.scene.start('OpeningScene'));

    // 网格参数：5 列 × 2 行
    const cols = 5;
    const cardW = 160, cardH = 92;
    const gapX = 16, gapY = 26;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (960 - totalW) / 2;
    const rowCY = [252, 366]; // 两行卡片中心 y

    careers.forEach((career, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + cardW / 2 + col * (cardW + gapX);
      const cy = rowCY[row];

      const isDeep = career.deep;
      const baseFill = isDeep ? 0x2a2a4e : 0x1e1e3a;
      const hoverFill = isDeep ? 0x3c3c5e : 0x2c2c4a;
      const nameColor = isDeep ? '#ffd24d' : '#e6e6e6';
      const descColor = isDeep ? '#aaaacc' : '#9aa0a6';

      // 卡片矩形
      let interactiveRect;
      if (isDeep) {
        // 金边 + 内部填充
        this.add.rectangle(cx, cy, cardW, cardH, 0xBFA34A);
        interactiveRect = this.add.rectangle(cx, cy, cardW - 6, cardH - 6, baseFill);
      } else {
        interactiveRect = this.add.rectangle(cx, cy, cardW, cardH, baseFill);
      }
      interactiveRect.setInteractive({ useHandCursor: true });

      // 文字（在卡片上）
      this.add.text(cx, cy - 14, career.name, {
        fontSize: '15px', color: nameColor,
      }).setOrigin(0.5);
      this.add.text(cx, cy + 14, career.desc, {
        fontSize: '11px', color: descColor,
      }).setOrigin(0.5);

      // 交互
      interactiveRect.on('pointerover', () => interactiveRect.setFillStyle(hoverFill));
      interactiveRect.on('pointerout', () => interactiveRect.setFillStyle(baseFill));
      interactiveRect.on('pointerdown', () => {
        console.log('选择职业', career.key);
        this.scene.start('WorldScene', { career: career.key, deep: career.deep, act: 1 });
      });
    });
  }
}
