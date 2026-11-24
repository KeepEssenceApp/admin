-- Made-up sign-ups for local development and the tests. Applied after 0001_waitlist.sql.
-- joined.* have an account in the fake core; invited.* are on its invitation list;
-- the rest are new. One note starts with "=" to exercise the spreadsheet guard.
DELETE FROM signups;
DELETE FROM attempts;
INSERT INTO signups (email, lang, storage, storage_other, sources, sources_other, assistant, mode, note, ip_hash, created_at, invited_at) VALUES
 ('new.ada@example.com',     'en',      'readwise,tabs',   '',         'x,hn,rss',            '',         'claude',            'own-assistant',  'Too many tabs I never go back to.',          'seed', '2026-11-24T09:12:00.000Z', NULL),
 ('new.bo@example.com',      'zh-Hans', 'wechat,other',    '备忘录',    'wechat-mp,xiaohongshu', '',       'chatgpt',           'built-in-agent', '存了从来不看。',                              'seed', '2026-11-24T07:40:00.000Z', NULL),
 ('new.chen@example.com',    'zh-Hans', 'notion',          '',         'zhihu,bilibili,other', '豆瓣',     'none',              'built-in-agent', '',                                           'seed', '2026-11-23T15:05:00.000Z', NULL),
 ('new.dana@example.com',    'en',      'raindrop',        '',         'youtube,podcast',     '',         'gemini',            'own-assistant',  '=HYPERLINK("https://example.com","click")',  'seed', '2026-11-23T11:30:00.000Z', NULL),
 ('new.emil@example.com',    'en',      'instapaper',      '',         'newsletter,substack', '',         'self-hosted-agent', 'own-assistant',  'Nothing reads it back to me.',               'seed', '2026-11-22T20:18:00.000Z', NULL),
 ('new.fang@example.com',    'zh-Hans', 'tabs',            '',         'jike,weibo',          '',         'claude',            'built-in-agent', '标签页开到一百多个。',                         'seed', '2026-11-22T08:02:00.000Z', NULL),
 ('invited.lin@example.com', 'zh-Hans', 'readwise',        '',         'wechat-mp',           '',         'claude',            'own-assistant',  '想让自己的助手来读。',                         'seed', '2026-11-21T13:45:00.000Z', '2026-11-24T02:00:00.000Z'),
 ('invited.omar@example.com','en',      'notion,tabs',     '',         'reddit,github',       '',         'chatgpt',           'built-in-agent', '',                                           'seed', '2026-11-21T06:10:00.000Z', '2026-11-23T21:00:00.000Z'),
 ('joined.mei@example.com',  'zh-Hans', 'wechat',          '',         'xiaohongshu,zhihu',   '',         'none',              'built-in-agent', '收藏夹太乱。',                                'seed', '2026-11-20T10:00:00.000Z', '2026-11-21T01:00:00.000Z'),
 ('joined.sam@example.com',  'en',      'raindrop,other',  'Pinboard', 'hn,linkedin,medium',  '',         'claude',            'own-assistant',  'I keep things and forget why.',              'seed', '2026-11-19T17:25:00.000Z', '2026-11-20T03:00:00.000Z');
