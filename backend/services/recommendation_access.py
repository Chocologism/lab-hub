from sqlalchemy import or_, exists
from ..models import ArxivPaper, RecommendationRecipient, LibraryPaper, LibraryAccess


def public_recommendation():
    return ~ArxivPaper.audience.has()


def visible_recommendation(user_id):
    received = exists().where(
        RecommendationRecipient.paper_id == ArxivPaper.id,
        RecommendationRecipient.user_id == user_id,
    )
    return or_(public_recommendation(), ArxivPaper.recommended_by_id == user_id, received)


def can_view(paper, user_id):
    return not paper.audience or paper.recommended_by_id == user_id or any(
        r.user_id == user_id for r in paper.audience.recipients)


def private_library_access(user_id):
    return exists().where(LibraryAccess.paper_id == LibraryPaper.id, LibraryAccess.user_id == user_id)


def visible_library(user_id):
    return or_(LibraryPaper.from_recommendation.is_(True), LibraryPaper.from_seminar.is_(True), private_library_access(user_id))
