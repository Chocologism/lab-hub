-- Demo dataset for Lab-Hub
-- Optional seed data for local testing or demonstration
-- Contains NO personal information or private credentials

INSERT OR IGNORE INTO resource_categories (id, name, is_default) VALUES
  (1, '教材', 1),
  (2, '工具', 1),
  (3, '网站', 1);

INSERT OR IGNORE INTO resource_books (id, title, original_title, authors, category, description, cover_url, tutorial_url, exercise_url, github_url, download_url, order_num) VALUES
  (1, '深入理解计算机系统 (CS:APP)', 'Computer Systems: A Programmer''s Perspective', 'Randal E. Bryant, David R. O''Hallaron', '教材', '计算机科学经典巨作，从程序员视角剖析计算机系统底层原理与软硬件接口。', '', 'https://csapp.cs.cmu.edu/', '', '', '#', 1),
  (2, '深度学习 (Deep Learning)', 'Deep Learning (Adaptive Computation and Machine Learning)', 'Ian Goodfellow, Yoshua Bengio, Aaron Courville', '教材', '深度学习领域的“花书”，全面阐述深度学习的数学基础与主流模型架构。', '', 'https://www.deeplearningbook.org/', '', 'https://github.com/huzhang/DeepLearning-Book-Notes', '#', 2);
