import json
from datetime import datetime
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .models import ArxivPaper, InviteCode, PaperReadMark, ResourceBook, SeminarSchedule, User

from .auth import get_password_hash


import os
import sys

def init_clean_db(reset: bool = False):
    """
    初始化生产环境干净数据库：
    - 保留管理员账号与邀请码
    - 保留学术教材专著资源
    - 清理/不添加任何模拟学生、导师、测试排期及文献
    """
    from .migrations import migrate
    from .database import Base, SessionLocal, engine

    if reset:
        print("正在重置数据库结构...")
        Base.metadata.drop_all(bind=engine)

    migrate(engine)
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        existing_admin = db.query(User).filter(User.email == admin_email).first()

        if not existing_admin:
            print("创建系统管理员账号...")
            admin = User(
                name="系统管理员",
                email=admin_email,
                hashed_password=get_password_hash(os.getenv("ADMIN_PASSWORD", "123456")),
                role="admin",
                can_manage_seminars=True,
                tutorial_completed=False,
                bio="Lab-Hub 课题组协作平台系统管理",
            )
            db.add(admin)
            db.commit()
            print(f"管理员账号已创建: {admin_email}")

        # 初始化默认邀请码（若 invite_codes 表为空）
        primary_code = os.getenv("LABHUB_INVITE_CODE", "LAB-2026")
        if db.query(InviteCode).count() == 0:
            admin_user = db.query(User).filter(User.email == admin_email).first()
            for code_str, note in [
                (primary_code, "默认注册邀请码"),
            ]:
                if not db.query(InviteCode).filter(InviteCode.code == code_str).first():
                    db.add(InviteCode(
                        code=code_str,
                        note=note,
                        created_by_id=admin_user.id if admin_user else None,
                        is_active=True,
                    ))
            db.commit()

        if db.query(ResourceBook).count() == 0:

            print("初始化权威学术参考教材资料...")
            books = [
                ResourceBook(
                    title="天体物理学导论 (An Introduction to Modern Astrophysics)",
                    original_title="An Introduction to Modern Astrophysics",
                    authors="Bradley W. Carroll, Dale A. Ostlie",
                    category="基础理论与专著",
                    description="现代天体物理领域的经典基石教程，系统涵盖恒星物理、星系演化、宇宙学以及高能天体物理，内容详尽严谨，广受研究生推崇。",
                    cover_url="",
                    tutorial_url="https://www.cambridge.org/highereducation/books/an-introduction-to-modern-astrophysics/F54E410EB6A3ACCE0F3EF3041BD13264",
                    exercise_url="https://github.com/topics/astrophysics",
                    github_url="https://github.com/astropy/astropy",
                    download_url="#",
                    order_num=1,
                ),
                ResourceBook(
                    title="星系物理与演化理论 (Galaxy Formation and Evolution)",
                    original_title="Galaxy Formation and Evolution",
                    authors="Houjun Mo, Frank van den Bosch, Simon White",
                    category="星系物理与结构",
                    description="深入探讨暗物质晕、星系动力学、恒星形成与反馈机制的权威专著，是星系演化与数值模拟方向的必读教材。",
                    cover_url="",
                    tutorial_url="https://www.cambridge.org/core/books/galaxy-formation-and-evolution/8064F9CF1B25C651F7FE0AE9C60575B5",
                    exercise_url="https://arxiv.org/abs/astro-ph/0407232",
                    github_url="https://github.com/topics/astronomy-simulations",
                    download_url="#",
                    order_num=2,
                ),
                ResourceBook(
                    title="现代物理宇宙学导论 (Introduction to Cosmology)",
                    original_title="Introduction to Cosmology",
                    authors="Barbara Ryden",
                    category="物理宇宙学",
                    description="清晰透彻论述弗里德曼方程、宇宙微波背景辐射、暴胀与暗能量等现代宇宙学核心理论框架。",
                    cover_url="",
                    tutorial_url="https://arxiv.org/abs/astro-ph/0509252",
                    exercise_url="https://arxiv.org/abs/astro-ph/0509252",
                    github_url="https://github.com/topics/cosmological-parameters",
                    download_url="#",
                    order_num=3,
                )
            ]
            db.add_all(books)
            db.commit()

        print("==================================================")
        print("🎉 干净生产数据库已准备就绪！")
        print(f"🔑 初始管理员: {admin_email} / 初始密码: {os.getenv('ADMIN_PASSWORD', 'lab123456')}")
        print("🎟️ 组内注册邀请码: LAB-2026")
        print("💡 建议首次登录后在个人中心修改密码。")
        print("==================================================")
    finally:
        db.close()



def _seed_default_invite_codes(db: Session) -> None:
    """确保数据库中至少有一条默认邀请码（幂等操作）。"""
    if db.query(InviteCode).count() > 0:
        return
    primary_code = os.getenv("LABHUB_INVITE_CODE", "LAB-2026")
    admin_user = db.query(User).filter(User.role == "admin").first()
    if not db.query(InviteCode).filter(InviteCode.code == primary_code).first():
        db.add(InviteCode(
            code=primary_code,
            note="默认注册邀请码",
            created_by_id=admin_user.id if admin_user else None,
            is_active=True,
        ))
        db.commit()
        print(f"🎟️ 默认邀请码已写入数据库: {primary_code}")


def init_db():
    if os.getenv("INIT_CLEAN_DB", "").lower() in ("1", "true", "yes"):
        init_clean_db()
        return

    from .migrations import migrate
    migrate(engine)
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # 如果已经存在用户，只补充种子邀请码后返回
        if db.query(User).first():
            print("数据库已存在数据，跳过初始数据填充（邀请码补种中）。")
            _seed_default_invite_codes(db)
            return

        print("开始初始化课题组基础演示数据...")

        # 1. 成员与老师用户
        admin = User(
            name="系统管理员",
            email="admin@lab.edu",
            hashed_password=get_password_hash("lab123456"),
            role="admin",
            bio="课题组网站系统管理",
        )
        prof_shu = User(
            name="导师 (PI)",
            email="shu@lab.edu",
            hashed_password=get_password_hash("lab123456"),
            role="teacher",
            bio="课题组负责人",
        )
        prof_wang = User(
            name="合作导师",
            email="wang@lab.edu",
            hashed_password=get_password_hash("lab123456"),
            role="teacher",
            bio="观测天体物理与多波段巡天",
        )
        prof_li = User(
            name="青年教师",
            email="li@lab.edu",
            hashed_password=get_password_hash("lab123456"),
            role="teacher",
            bio="大尺度结构与理论天体物理",
        )
        student1 = User(
            name="张明 (博士生)",
            email="student@lab.edu",
            hashed_password=get_password_hash("lab123456"),
            role="student",
            bio="科学机器学习与数值模拟算法方向",
        )

        db.add_all([admin, prof_shu, prof_wang, prof_li, student1])
        db.commit()
        db.refresh(prof_shu)
        db.refresh(student1)

        # 2. arXiv 推荐文献（涵盖导师专属高亮推荐）
        paper1 = ArxivPaper(
            arxiv_id="2301.07094",
            title="JWST High-Redshift Galaxy Survey in Deep Cosmological Fields",
            authors=json.dumps(["A. Smith", "B. Johnson", "C. Davis et al."], ensure_ascii=False),
            abstract="We present new high-resolution imaging and spectroscopy from the James Webb Space Telescope in deep cosmological fields, constraining early star formation and the galaxy luminosity function at z > 8.",
            primary_category="astro-ph.CO",
            published_date="2023-01-17",
            pdf_url="https://arxiv.org/pdf/2301.07094.pdf",
            recommended_by_id=prof_shu.id,
            recommend_comment="导师：这篇文章利用最新的 JWST 深度巡天数据对早期星系形成给出了极其严谨的约束，数据处理与光度红移拟合算法很值得我们在下周五组会深入探讨！",
            is_pinned=True,
        )

        paper2 = ArxivPaper(
            arxiv_id="2402.08654",
            title="Denoising Diffusion Probabilistic Models for Astronomical Image Reconstruction",
            authors=json.dumps(["M. Zhang", "L. Wang", "K. Ting"], ensure_ascii=False),
            abstract="Reconstructing high-fidelity astronomical observations from noisy and blurred detector data is an ill-posed inverse problem. Here we demonstrate how diffusion priors yield superior fidelity over traditional deconvolution algorithms.",
            primary_category="astro-ph.IM",
            published_date="2024-02-13",
            pdf_url="https://arxiv.org/pdf/2402.08654.pdf",
            recommended_by_id=student1.id,
            recommend_comment="读了一下这篇使用扩散模型进行高分辨率天文图像超分辨重建的思路，数学推导非常扎实，感觉可以结合我们正在跑的模拟数据做实验测试。",
            is_pinned=False,
        )

        db.add_all([paper1, paper2])
        db.commit()
        db.refresh(paper1)

        # 3. 组会排期
        seminar1 = SeminarSchedule(
            date="2026-09-18",
            time="14:30",
            location="物理楼 302 研讨室 / 腾讯会议 892-123-456",
            presenter_name="张明 (博士生)",
            presenter_id=student1.id,
            topic="JWST 深度巡天早期星系形态演化与多波段光度拟合",
            paper_id=paper1.id,
            slides_url="https://example.com/slides-jwst-galaxies.pdf",
            notes="请大家提前阅读导师推荐的 2301.07094 文献，重点关注其高红移星系光度红移的卡方计算细节。",
            status="upcoming",
        )
        seminar2 = SeminarSchedule(
            date="2026-09-11",
            time="14:30",
            location="物理楼 302 研讨室",
            presenter_name="李航 (硕士生)",
            topic="基于前馈神经网络的变源光变曲线特征快速筛选",
            slides_url="https://example.com/lightcurve-ml.pdf",
            notes="已顺利完成，代码已同步至课题组内部仓库。",
            status="completed",
        )
        db.add_all([seminar1, seminar2])

        # 4. 教材与综述资料库（聚合教程、习题集与代码直达）
        books = [
            ResourceBook(
                title="天体物理学导论 (An Introduction to Modern Astrophysics)",
                original_title="An Introduction to Modern Astrophysics",
                authors="Bradley W. Carroll, Dale A. Ostlie",
                category="基础理论与专著",
                description="现代天体物理领域的经典基石教程，系统涵盖恒星物理、星系演化、宇宙学以及高能天体物理，内容详尽严谨，广受研究生推崇。",
                cover_url="https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80",
                tutorial_url="https://www.cambridge.org/highereducation/books/an-introduction-to-modern-astrophysics/F54E410EB6A3ACCE0F3EF3041BD13264",
                exercise_url="https://github.com/topics/astrophysics",
                github_url="https://github.com/astropy/astropy",
                download_url=None,
                order_num=1,
            ),
            ResourceBook(
                title="星系物理与演化理论 (Galaxy Formation and Evolution)",
                original_title="Galaxy Formation and Evolution",
                authors="Houjun Mo, Frank van den Bosch, Simon White",
                category="星系物理与结构",
                description="深入探讨暗物质晕、星系动力学、恒星形成与反馈机制的权威专著，是星系演化与数值模拟方向的必读教材。",
                cover_url="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80",
                tutorial_url="https://www.cambridge.org/core/books/galaxy-formation-and-evolution/8064F9CF1B25C651F7FE0AE9C60575B5",
                exercise_url="https://arxiv.org/abs/astro-ph/0407232",
                github_url="https://github.com/topics/astronomy-simulations",
                download_url=None,
                order_num=2,
            ),
            ResourceBook(
                title="现代物理宇宙学导论 (Introduction to Cosmology)",
                original_title="Introduction to Cosmology",
                authors="Barbara Ryden",
                category="物理宇宙学",
                description="清晰透彻论述弗里德曼方程、宇宙微波背景辐射、暴胀与暗能量等现代宇宙学核心理论框架。",
                cover_url="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&auto=format&fit=crop&q=80",
                tutorial_url="https://arxiv.org/abs/astro-ph/0509252",
                exercise_url="https://arxiv.org/abs/astro-ph/0509252",
                github_url="https://github.com/topics/cosmological-parameters",
                download_url=None,
                order_num=3,
            )
        ]
        db.add_all(books)
        db.commit()
        print("课题组初始数据成功初始化！")
    finally:
        from .services.library_service import backfill
        backfill(db)
        _seed_default_invite_codes(db)
        db.close()



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Lab-Hub 数据库初始化工具")
    parser.add_argument("--clean", action="store_true", help="初始化干净的生产数据库（仅创建管理员与教材资料，无模拟用户与排期）")
    parser.add_argument("--reset", action="store_true", help="重置已有表结构后再进行初始化")
    args = parser.parse_args()

    if args.clean:
        init_clean_db(reset=args.reset)
    else:
        init_db()
