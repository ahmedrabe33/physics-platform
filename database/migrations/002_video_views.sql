-- ============================
-- Video Views Tracking
-- ============================

CREATE TABLE IF NOT EXISTS video_views (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT NOT NULL,
    lesson_id BIGINT NOT NULL,

    video_url TEXT,

    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_video_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_video_lesson
        FOREIGN KEY (lesson_id)
        REFERENCES lessons(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_video_views_user
ON video_views(user_id);


CREATE INDEX IF NOT EXISTS idx_video_views_lesson
ON video_views(lesson_id);


CREATE INDEX IF NOT EXISTS idx_video_views_date
ON video_views(opened_at);
