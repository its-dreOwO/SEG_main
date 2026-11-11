export const roles = [
  ['super_admin', 'Manage users, roles, permissions, logs and settings'],
  ['content_manager', 'Full CRUD on content, publishing and taxonomy'],
  ['moderator', 'Review comments, handle flags and spam'],
  ['seo_specialist', 'SEO metadata and analytics dashboards'],
  ['store_manager', 'Read-only access to the database dashboard (products, stock, comments, search log)'],
  ['customer', 'Registered shopper'],
];

export const permissions = [
  'users.manage', 'roles.manage', 'logs.view', 'settings.manage', 'content.manage',
  'taxonomy.manage', 'moderation.manage', 'seo.manage', 'analytics.view',
  'db.view',
];

export const rolePermissions = {
  super_admin: ['users.manage', 'roles.manage', 'logs.view', 'settings.manage', 'db.view'],
  content_manager: ['content.manage', 'taxonomy.manage'],
  moderator: ['moderation.manage'],
  seo_specialist: ['seo.manage', 'analytics.view'],
  store_manager: ['db.view'],
  customer: [],
};

export const users = [
  { email: 'admin@shop.test', name: 'Alex Admin', role: 'super_admin' },
  { email: 'content@shop.test', name: 'Casey Content', role: 'content_manager' },
  { email: 'moderator@shop.test', name: 'Morgan Moderator', role: 'moderator' },
  { email: 'seo@shop.test', name: 'Sam SEO', role: 'seo_specialist' },
  { email: 'manager@shop.test', name: 'Robin Manager', role: 'store_manager' },
  { email: 'linh@shop.test', name: 'Linh Tran', role: 'customer' },
  { email: 'minh@shop.test', name: 'Minh Nguyen', role: 'customer' },
  { email: 'hannah@shop.test', name: 'Hannah Brooks', role: 'customer' },
];

export const categories = [
  ['phones', 'Phones', 'Điện thoại'],
  ['headphones', 'Headphones', 'Tai nghe'],
  ['speakers', 'Speakers', 'Loa'],
  ['laptops', 'Laptops', 'Laptop'],
  ['desktop-pcs', 'Desktop PCs', 'Máy tính để bàn'],
  ['monitors', 'Monitors', 'Màn hình'],
  ['keyboards-mice', 'Keyboards & Mice', 'Bàn phím & chuột'],
  ['smart-watches', 'Smart Watches', 'Đồng hồ thông minh'],
];

export const settings = {
  store_name: 'Volt',
  promo_banner: 'Free shipping on orders over $50',
  vnd_rate: '25000',
  comment_moderation: 'off',
};
