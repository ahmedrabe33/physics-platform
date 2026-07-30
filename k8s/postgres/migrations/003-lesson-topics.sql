-- ======================================================
-- 003 - Lesson Topics + Video Views Topic Support
-- ======================================================


CREATE TABLE IF NOT EXISTS lesson_topics (

    id BIGSERIAL PRIMARY KEY,

    lesson_id BIGINT NOT NULL
        REFERENCES lessons(id)
        ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,

    description TEXT,

    video_url TEXT,

    topic_order INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_lesson_topics_lesson_id
ON lesson_topics(lesson_id);



-- ======================================================
-- Add topic_id to EXISTING video_views table
-- ======================================================

ALTER TABLE video_views
ADD COLUMN IF NOT EXISTS topic_id BIGINT;



-- ======================================================
-- Add foreign key safely
-- ======================================================

DO $$
BEGIN

    IF NOT EXISTS (

        SELECT 1

        FROM pg_constraint

        WHERE conname = 'fk_video_views_topic'

    ) THEN

        ALTER TABLE video_views

        ADD CONSTRAINT fk_video_views_topic

        FOREIGN KEY (topic_id)

        REFERENCES lesson_topics(id)

        ON DELETE SET NULL;

    END IF;

END
$$;



CREATE INDEX IF NOT EXISTS idx_video_views_topic_id
ON video_views(topic_id);
