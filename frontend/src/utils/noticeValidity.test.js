import { describe, it, expect } from "vitest"
import {
  getNoticeDate,
  getDaysDifference,
  isNoticeActiveForMarquee,
  filterMarqueeNotices
} from "./noticeValidity"

describe("noticeValidity utility", () => {
  const baseToday = "2026-09-19"

  describe("getNoticeDate", () => {
    it("extracts formatted date from start_date", () => {
      expect(getNoticeDate({ start_date: "2026-09-13" })).toBe("2026-09-13")
      expect(getNoticeDate({ start_date: "2026/9/5" })).toBe("2026-09-05")
    })

    it("falls back to created_at when start_date is absent", () => {
      expect(getNoticeDate({ created_at: "2026-09-10 14:30:00" })).toBe("2026-09-10")
    })

    it("returns empty string when no date is available", () => {
      expect(getNoticeDate({})).toBe("")
      expect(getNoticeDate(null)).toBe("")
    })
  })

  describe("getDaysDifference", () => {
    it("computes exact day differences correctly", () => {
      expect(getDaysDifference("2026-09-19", "2026-09-19")).toBe(0)
      expect(getDaysDifference("2026-09-13", "2026-09-19")).toBe(6)
      expect(getDaysDifference("2026-09-05", "2026-09-19")).toBe(14)
      expect(getDaysDifference("2026-09-04", "2026-09-19")).toBe(15)
      expect(getDaysDifference("2026-09-25", "2026-09-19")).toBe(-6)
    })
  })

  describe("isNoticeActiveForMarquee", () => {
    it("handles time-bounded notices using end_date", () => {
      // Future deadline -> active
      expect(isNoticeActiveForMarquee({
        title: "奖学金申请",
        end_date: "2026-09-23"
      }, baseToday)).toBe(true)

      // Today deadline -> active
      expect(isNoticeActiveForMarquee({
        title: "今日截止事务",
        end_date: "2026-09-19"
      }, baseToday)).toBe(true)

      // Past deadline -> inactive
      expect(isNoticeActiveForMarquee({
        title: "已截止事务",
        end_date: "2026-09-18"
      }, baseToday)).toBe(false)
    })

    it("handles permanent notices (without end_date) within 2 weeks", () => {
      // Notice from 6 days ago (2026-09-13) -> active
      expect(isNoticeActiveForMarquee({
        title: "学分认定要求落实通知",
        start_date: "2026-09-13",
        end_date: ""
      }, baseToday)).toBe(true)

      // Notice from exactly 14 days ago (2026-09-05) -> active (still within 2 weeks)
      expect(isNoticeActiveForMarquee({
        title: "实验室规程",
        start_date: "2026-09-05",
        end_date: ""
      }, baseToday)).toBe(true)
    })

    it("filters out permanent notices exceeding 2 weeks", () => {
      // Notice from 15 days ago (2026-09-04) -> inactive (exceeded 2 weeks)
      expect(isNoticeActiveForMarquee({
        title: "东区老旧办公须知",
        start_date: "2026-09-04",
        end_date: ""
      }, baseToday)).toBe(false)

      // Notice from 30 days ago -> inactive
      expect(isNoticeActiveForMarquee({
        title: "上个月的长期规章",
        start_date: "2026-08-20",
        end_date: null
      }, baseToday)).toBe(false)
    })

    it("uses created_at as fallback when start_date is empty", () => {
      expect(isNoticeActiveForMarquee({
        title: "近期新建通知",
        start_date: "",
        created_at: "2026-09-15 09:00:00",
        end_date: ""
      }, baseToday)).toBe(true)

      expect(isNoticeActiveForMarquee({
        title: "三周前新建长期通知",
        start_date: "",
        created_at: "2026-08-25 09:00:00",
        end_date: ""
      }, baseToday)).toBe(false)
    })
  })

  describe("filterMarqueeNotices", () => {
    it("filters candidate list accurately according to the 2-week rule", () => {
      const candidates = [
        { id: 1, title: "奖学金通知", end_date: "2026-09-23", start_date: "2026-09-13" }, // active (deadline in future)
        { id: 2, title: "已过期的调休", end_date: "2026-09-15", start_date: "2026-09-10" }, // expired
        { id: 3, title: "长期学分要求", end_date: "", start_date: "2026-09-16" }, // active (3 days ago <= 14)
        { id: 4, title: "14天前的长期安全提醒", end_date: "", start_date: "2026-09-05" }, // active (14 days ago <= 14)
        { id: 5, title: "三周前的长期规章", end_date: "", start_date: "2026-08-28" }, // inactive (> 14 days)
      ]

      const filtered = filterMarqueeNotices(candidates, baseToday)
      expect(filtered.map(i => i.id)).toEqual([1, 3, 4])
    })
  })
})
