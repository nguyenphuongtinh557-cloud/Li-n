/**
 * exam.js — Exam Engine
 * Tạo bộ đề cân bằng độ khó, quản lý trạng thái thi
 */

import { DB } from './db.js';

export const ExamEngine = {
  /**
   * Tạo bộ đề cân bằng theo tỉ lệ độ khó
   * @param {number} totalCount - tổng số câu (50, 40, 60...)
   * @param {object} ratio - { easy, medium, hard } - tổng = 1.0
   * @param {number} chapterFilter - 0 = tất cả
   * @returns {{ questions: Array, meta: object } | null}
   */
  buildBalancedPaper(totalCount = 50, ratio = null, chapterFilter = 0) {
    const settings = DB.getSettings();
    const r = ratio || settings.diffRatio || { easy: 0.5, medium: 0.3, hard: 0.2 };

    const bank = DB.getBank().filter(q =>
      chapterFilter === 0 || q.chapter === chapterFilter
    );

    // Nhóm theo độ khó
    const byDiff = {
      1: _shuffle(bank.filter(q => (q.difficulty || 1) === 1)),
      2: _shuffle(bank.filter(q => (q.difficulty || 1) === 2)),
      3: _shuffle(bank.filter(q => (q.difficulty || 1) === 3)),
    };

    // Tính số câu cần cho mỗi mức
    let needEasy   = Math.round(totalCount * r.easy);
    let needMedium = Math.round(totalCount * r.medium);
    let needHard   = totalCount - needEasy - needMedium;

    // Kiểm tra đủ câu không, nếu thiếu thì bù từ nhóm khác
    const adjustedCounts = _adjustCounts(
      { easy: needEasy, medium: needMedium, hard: needHard },
      { easy: byDiff[1].length, medium: byDiff[2].length, hard: byDiff[3].length },
      totalCount
    );

    needEasy   = adjustedCounts.easy;
    needMedium = adjustedCounts.medium;
    needHard   = adjustedCounts.hard;

    const actual = needEasy + needMedium + needHard;
    if (actual === 0) return null;

    // Lấy câu không trùng
    const questions = [
      ...byDiff[1].slice(0, needEasy),
      ...byDiff[2].slice(0, needMedium),
      ...byDiff[3].slice(0, needHard),
    ];

    // Shuffle lại toàn bộ để không lộ thứ tự độ khó
    const shuffled = _shuffle(questions).map(q => _shuffleOptions(q));

    return {
      questions: shuffled,
      meta: {
        total: shuffled.length,
        easy: needEasy,
        medium: needMedium,
        hard: needHard,
        ratioActual: {
          easy: (needEasy / shuffled.length * 100).toFixed(0),
          medium: (needMedium / shuffled.length * 100).toFixed(0),
          hard: (needHard / shuffled.length * 100).toFixed(0),
        },
      },
    };
  },

  /** Tạo bộ đề luyện tập (không cân bằng độ khó) */
  buildPracticePaper(count, chapterFilter = 0) {
    const bank = DB.getBank().filter(q =>
      chapterFilter === 0 || q.chapter === chapterFilter
    );
    const shuffled = _shuffle(bank).slice(0, count);
    return shuffled.map(q => _shuffleOptions(q));
  },

  /**
   * Chấm điểm bài thi
   * @param {Array} questions - câu hỏi đề thi
   * @param {object} userAnswers - { index: optionIndex }
   * @param {number} totalTime - thời gian tổng (giây)
   * @param {number} timeLeft - thời gian còn lại (giây)
   * @returns {object} result
   */
  gradeExam(questions, userAnswers, totalTime, timeLeft) {
    let correctCount = 0;
    const chapterStats = {};
    const diffStats = { 1: { c: 0, t: 0 }, 2: { c: 0, t: 0 }, 3: { c: 0, t: 0 } };
    const questionResults = [];

    questions.forEach((q, idx) => {
      const userAns = userAnswers[idx];
      const isCorrect = userAns !== undefined && userAns === q.correct;
      const ch = q.chapter;
      const diff = q.difficulty || 1;

      if (!chapterStats[ch]) chapterStats[ch] = { c: 0, t: 0 };
      chapterStats[ch].t++;
      diffStats[diff].t++;

      if (isCorrect) {
        correctCount++;
        chapterStats[ch].c++;
        diffStats[diff].c++;
      }

      questionResults.push({
        idx,
        q: q.q,
        options: q.options,
        correct: q.correct,
        userAns,
        isCorrect,
        chapter: ch,
        difficulty: diff,
        exp: q.exp,
      });
    });

    const total = questions.length;
    const score10 = total > 0 ? (correctCount / total * 10) : 0;
    const timeSpent = totalTime - timeLeft;

    return {
      total,
      correctCount,
      score10: parseFloat(score10.toFixed(1)),
      pct: Math.round(correctCount / total * 100),
      timeSpent,
      isPassed: score10 >= 7.0,
      chapterStats,
      diffStats,
      questionResults,
    };
  },
};

/* ─── Timer State ─── */
export class ExamTimer {
  constructor(durationSeconds, onTick, onExpire) {
    this.total = durationSeconds;
    this.left  = durationSeconds;
    this.paused = false;
    this._onTick = onTick;
    this._onExpire = onExpire;
    this._intervalId = null;
  }

  start() {
    this.stop();
    this._intervalId = setInterval(() => {
      if (this.paused) return;
      this.left--;
      this._onTick(this.left, this.total);
      if (this.left <= 0) {
        this.stop();
        this._onExpire();
      }
    }, 1000);
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  format(seconds = this.left) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  get isUrgent() { return this.left <= 300 && this.left > 0; } // 5 phút cuối
}

/* ─── Private helpers ─── */

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Xáo trộn đáp án của câu hỏi, giữ chỉ số đáp án đúng */
function _shuffleOptions(q) {
  const opts = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct }));
  const shuffled = _shuffle(opts);
  return {
    ...q,
    options: shuffled.map(o => o.text),
    correct: shuffled.findIndex(o => o.isCorrect),
  };
}

/** Điều chỉnh số câu theo mức khi không đủ trong một nhóm */
function _adjustCounts(needed, available, total) {
  let { easy, medium, hard } = needed;

  // Nếu thiếu ở nhóm nào, bù từ nhóm có nhiều nhất
  if (available.easy < easy) {
    const deficit = easy - available.easy;
    easy = available.easy;
    // Bù vào medium trước, rồi hard
    const addToMedium = Math.min(deficit, available.medium - medium);
    medium += addToMedium;
    hard += deficit - addToMedium;
  }

  if (available.medium < medium) {
    const deficit = medium - available.medium;
    medium = available.medium;
    const addToEasy = Math.min(deficit, available.easy - easy);
    easy += addToEasy;
    hard += deficit - addToEasy;
  }

  if (available.hard < hard) {
    const deficit = hard - available.hard;
    hard = available.hard;
    const addToMedium = Math.min(deficit, available.medium - medium);
    medium += addToMedium;
    easy += deficit - addToMedium;
  }

  // Clamp tất cả
  easy   = Math.max(0, Math.min(easy,   available.easy));
  medium = Math.max(0, Math.min(medium, available.medium));
  hard   = Math.max(0, Math.min(hard,   available.hard));

  return { easy, medium, hard };
}
