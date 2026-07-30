CREATE TABLE IF NOT EXISTS lesson_topics (
    id BIGSERIAL PRIMARY KEY,
    lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    video_url TEXT,
    topic_order INTEGER DEFAULT 1
);


CREATE TABLE IF NOT EXISTS video_views (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    topic_id BIGINT REFERENCES lesson_topics(id) ON DELETE CASCADE,
    video_url TEXT,
    opened_at TIMESTAMPTZ DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_video_views_user
ON video_views(user_id);


CREATE INDEX IF NOT EXISTS idx_video_views_lesson
ON video_views(lesson_id);
