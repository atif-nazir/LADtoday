export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ab_tests: {
        Row: {
          article_id: string | null
          clicks_a: number | null
          clicks_b: number | null
          concluded_at: string | null
          confidence: number | null
          id: string
          impressions_a: number | null
          impressions_b: number | null
          run_id: string | null
          start_at: string | null
          status: string | null
          test_type: string | null
          variant_a: Json | null
          variant_b: Json | null
          winner: string | null
        }
        Insert: {
          article_id?: string | null
          clicks_a?: number | null
          clicks_b?: number | null
          concluded_at?: string | null
          confidence?: number | null
          id?: string
          impressions_a?: number | null
          impressions_b?: number | null
          run_id?: string | null
          start_at?: string | null
          status?: string | null
          test_type?: string | null
          variant_a?: Json | null
          variant_b?: Json | null
          winner?: string | null
        }
        Update: {
          article_id?: string | null
          clicks_a?: number | null
          clicks_b?: number | null
          concluded_at?: string | null
          confidence?: number | null
          id?: string
          impressions_a?: number | null
          impressions_b?: number | null
          run_id?: string | null
          start_at?: string | null
          status?: string | null
          test_type?: string | null
          variant_a?: Json | null
          variant_b?: Json | null
          winner?: string | null
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          created_at: string
          details: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          source: string
          timestamp: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          level?: string
          message: string
          metadata?: Json | null
          source?: string
          timestamp?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          source?: string
          timestamp?: string
        }
        Relationships: []
      }
      agent_outputs: {
        Row: {
          agent_key: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          output: Json
          run_id: string
          status: string
          tokens: number
        }
        Insert: {
          agent_key: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          output?: Json
          run_id: string
          status?: string
          tokens?: number
        }
        Update: {
          agent_key?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          output?: Json
          run_id?: string
          status?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_registry: {
        Row: {
          depends_on: string[]
          description: string | null
          enabled: boolean
          key: string
          model: string
          name: string
          order_index: number
          phase: string
          updated_at: string
        }
        Insert: {
          depends_on?: string[]
          description?: string | null
          enabled?: boolean
          key: string
          model?: string
          name: string
          order_index: number
          phase: string
          updated_at?: string
        }
        Update: {
          depends_on?: string[]
          description?: string | null
          enabled?: boolean
          key?: string
          model?: string
          name?: string
          order_index?: number
          phase?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          article_id: string | null
          created_at: string | null
          event_type: string | null
          ga4_measurement_id: string | null
          goals: Json | null
          id: string
          run_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          views_30d: number | null
          views_7d: number | null
        }
        Insert: {
          article_id?: string | null
          created_at?: string | null
          event_type?: string | null
          ga4_measurement_id?: string | null
          goals?: Json | null
          id?: string
          run_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          views_30d?: number | null
          views_7d?: number | null
        }
        Update: {
          article_id?: string | null
          created_at?: string | null
          event_type?: string | null
          ga4_measurement_id?: string | null
          goals?: Json | null
          id?: string
          run_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          views_30d?: number | null
          views_7d?: number | null
        }
        Relationships: []
      }
      article_fb_posts: {
        Row: {
          article_id: string
          created_at: string
          error_message: string | null
          fb_post_id: string | null
          id: string
          page_id: string
          posted_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          article_id: string
          created_at?: string
          error_message?: string | null
          fb_post_id?: string | null
          id?: string
          page_id: string
          posted_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          error_message?: string | null
          fb_post_id?: string | null
          id?: string
          page_id?: string
          posted_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_fb_posts_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_fb_posts_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "facebook_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      article_predictions: {
        Row: {
          article_id: string | null
          boost_budget_pkr: number | null
          boost_recommended: boolean | null
          content_tier: string | null
          created_at: string | null
          id: string
          predictions: Json | null
          revenue_estimate_pkr: number | null
          run_id: string | null
          views_30d: number | null
          views_7d: number | null
          viral_score: number | null
        }
        Insert: {
          article_id?: string | null
          boost_budget_pkr?: number | null
          boost_recommended?: boolean | null
          content_tier?: string | null
          created_at?: string | null
          id?: string
          predictions?: Json | null
          revenue_estimate_pkr?: number | null
          run_id?: string | null
          views_30d?: number | null
          views_7d?: number | null
          viral_score?: number | null
        }
        Update: {
          article_id?: string | null
          boost_budget_pkr?: number | null
          boost_recommended?: boolean | null
          content_tier?: string | null
          created_at?: string | null
          id?: string
          predictions?: Json | null
          revenue_estimate_pkr?: number | null
          run_id?: string | null
          views_30d?: number | null
          views_7d?: number | null
          viral_score?: number | null
        }
        Relationships: []
      }
      article_revenue: {
        Row: {
          adsense_tier: string | null
          affiliate_potential: string | null
          article_id: string | null
          created_at: string | null
          estimated_cpm_usd: number | null
          id: string
          projected_revenue_30d_pkr: number | null
          projected_revenue_30d_usd: number | null
          revenue_grade: string | null
          run_id: string | null
        }
        Insert: {
          adsense_tier?: string | null
          affiliate_potential?: string | null
          article_id?: string | null
          created_at?: string | null
          estimated_cpm_usd?: number | null
          id?: string
          projected_revenue_30d_pkr?: number | null
          projected_revenue_30d_usd?: number | null
          revenue_grade?: string | null
          run_id?: string | null
        }
        Update: {
          adsense_tier?: string | null
          affiliate_potential?: string | null
          article_id?: string | null
          created_at?: string | null
          estimated_cpm_usd?: number | null
          id?: string
          projected_revenue_30d_pkr?: number | null
          projected_revenue_30d_usd?: number | null
          revenue_grade?: string | null
          run_id?: string | null
        }
        Relationships: []
      }
      articles: {
        Row: {
          ai_rewrite_count: number
          ai_rewrite_status: string
          ai_thumbnail_url: string | null
          author_avatar: string | null
          author_bio: string | null
          author_facebook: string | null
          author_instagram: string | null
          author_linkedin: string | null
          author_name: string
          author_twitter: string | null
          category_id: string
          conclusion: string | null
          created_at: string
          date: string
          fb_caption: string | null
          fb_post_id: string | null
          fb_posted: boolean | null
          fb_posted_at: string | null
          hashtags_facebook: string[] | null
          hashtags_master: string[] | null
          hashtags_twitter: string[] | null
          id: string
          image: string
          introduction: string | null
          last_refreshed: string | null
          old_article_id: string | null
          published: boolean
          read_time: string
          refresh_count: number | null
          refreshed_at: string | null
          sections: Json
          slug: string
          source_id: string | null
          subtitle: string | null
          tags: string[] | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          ai_rewrite_count?: number
          ai_rewrite_status?: string
          ai_thumbnail_url?: string | null
          author_avatar?: string | null
          author_bio?: string | null
          author_facebook?: string | null
          author_instagram?: string | null
          author_linkedin?: string | null
          author_name: string
          author_twitter?: string | null
          category_id: string
          conclusion?: string | null
          created_at?: string
          date: string
          fb_caption?: string | null
          fb_post_id?: string | null
          fb_posted?: boolean | null
          fb_posted_at?: string | null
          hashtags_facebook?: string[] | null
          hashtags_master?: string[] | null
          hashtags_twitter?: string[] | null
          id?: string
          image: string
          introduction?: string | null
          last_refreshed?: string | null
          old_article_id?: string | null
          published?: boolean
          read_time: string
          refresh_count?: number | null
          refreshed_at?: string | null
          sections?: Json
          slug: string
          source_id?: string | null
          subtitle?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          ai_rewrite_count?: number
          ai_rewrite_status?: string
          ai_thumbnail_url?: string | null
          author_avatar?: string | null
          author_bio?: string | null
          author_facebook?: string | null
          author_instagram?: string | null
          author_linkedin?: string | null
          author_name?: string
          author_twitter?: string | null
          category_id?: string
          conclusion?: string | null
          created_at?: string
          date?: string
          fb_caption?: string | null
          fb_post_id?: string | null
          fb_posted?: boolean | null
          fb_posted_at?: string | null
          hashtags_facebook?: string[] | null
          hashtags_master?: string[] | null
          hashtags_twitter?: string[] | null
          id?: string
          image?: string
          introduction?: string | null
          last_refreshed?: string | null
          old_article_id?: string | null
          published?: boolean
          read_time?: string
          refresh_count?: number | null
          refreshed_at?: string | null
          sections?: Json
          slug?: string
          source_id?: string | null
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scraper_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          backup_date: string | null
          created_at: string | null
          id: string
          manifest: Json | null
          pruned_count: number | null
          status: string | null
          tables_backed: number | null
          tables_failed: number | null
          total_bytes: number | null
          total_rows: number | null
        }
        Insert: {
          backup_date?: string | null
          created_at?: string | null
          id: string
          manifest?: Json | null
          pruned_count?: number | null
          status?: string | null
          tables_backed?: number | null
          tables_failed?: number | null
          total_bytes?: number | null
          total_rows?: number | null
        }
        Update: {
          backup_date?: string | null
          created_at?: string | null
          id?: string
          manifest?: Json | null
          pruned_count?: number | null
          status?: string | null
          tables_backed?: number | null
          tables_failed?: number | null
          total_bytes?: number | null
          total_rows?: number | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cleanup_reports: {
        Row: {
          duration_ms: number | null
          id: string
          ran_at: string | null
          space_freed: string | null
          status: string | null
          tasks: Json | null
          total_archived: number | null
          total_deleted: number | null
        }
        Insert: {
          duration_ms?: number | null
          id: string
          ran_at?: string | null
          space_freed?: string | null
          status?: string | null
          tasks?: Json | null
          total_archived?: number | null
          total_deleted?: number | null
        }
        Update: {
          duration_ms?: number | null
          id?: string
          ran_at?: string | null
          space_freed?: string | null
          status?: string | null
          tasks?: Json | null
          total_archived?: number | null
          total_deleted?: number | null
        }
        Relationships: []
      }
      content_calendar: {
        Row: {
          article_id: string | null
          article_url: string | null
          created_at: string | null
          date: string | null
          id: string
          reason: string | null
          status: string | null
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          article_id?: string | null
          article_url?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          status?: string | null
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          article_id?: string | null
          article_url?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          reason?: string | null
          status?: string | null
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cost_reports: {
        Row: {
          budget_status: string | null
          budget_used_pct: number | null
          generated_at: string | null
          id: string
          period: string | null
          period_type: string | null
          report: Json | null
          total_cost_pkr: number | null
          total_cost_usd: number | null
          total_runs: number | null
          total_tokens: number | null
        }
        Insert: {
          budget_status?: string | null
          budget_used_pct?: number | null
          generated_at?: string | null
          id: string
          period?: string | null
          period_type?: string | null
          report?: Json | null
          total_cost_pkr?: number | null
          total_cost_usd?: number | null
          total_runs?: number | null
          total_tokens?: number | null
        }
        Update: {
          budget_status?: string | null
          budget_used_pct?: number | null
          generated_at?: string | null
          id?: string
          period?: string | null
          period_type?: string | null
          report?: Json | null
          total_cost_pkr?: number | null
          total_cost_usd?: number | null
          total_runs?: number | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      engagement_reports: {
        Row: {
          article_id: string | null
          comments: number | null
          created_at: string | null
          engagement_grade: string | null
          engagement_score: number | null
          id: string
          likes: number | null
          platform: string | null
          recommendations: Json | null
          run_id: string | null
          shares: number | null
        }
        Insert: {
          article_id?: string | null
          comments?: number | null
          created_at?: string | null
          engagement_grade?: string | null
          engagement_score?: number | null
          id?: string
          likes?: number | null
          platform?: string | null
          recommendations?: Json | null
          run_id?: string | null
          shares?: number | null
        }
        Update: {
          article_id?: string | null
          comments?: number | null
          created_at?: string | null
          engagement_grade?: string | null
          engagement_score?: number | null
          id?: string
          likes?: number | null
          platform?: string | null
          recommendations?: Json | null
          run_id?: string | null
          shares?: number | null
        }
        Relationships: []
      }
      facebook_pages: {
        Row: {
          access_token: string
          auto_post: boolean
          created_at: string
          id: string
          is_active: boolean
          page_id: string
          page_name: string
          thumbnail_theme: string
          updated_at: string
        }
        Insert: {
          access_token: string
          auto_post?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          page_id: string
          page_name: string
          thumbnail_theme?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          auto_post?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          page_id?: string
          page_name?: string
          thumbnail_theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      hashtag_analytics: {
        Row: {
          hashtag: string | null
          id: string
          last_used_at: string | null
          run_id: string | null
          times_used: number | null
          topic_category: string | null
          total_impressions: number | null
        }
        Insert: {
          hashtag?: string | null
          id?: string
          last_used_at?: string | null
          run_id?: string | null
          times_used?: number | null
          topic_category?: string | null
          total_impressions?: number | null
        }
        Update: {
          hashtag?: string | null
          id?: string
          last_used_at?: string | null
          run_id?: string | null
          times_used?: number | null
          topic_category?: string | null
          total_impressions?: number | null
        }
        Relationships: []
      }
      influencer_outreach: {
        Row: {
          article_url: string | null
          created_at: string | null
          id: string
          influencer_name: string | null
          message: string | null
          platform: string | null
          priority: string | null
          run_id: string | null
          status: string | null
        }
        Insert: {
          article_url?: string | null
          created_at?: string | null
          id?: string
          influencer_name?: string | null
          message?: string | null
          platform?: string | null
          priority?: string | null
          run_id?: string | null
          status?: string | null
        }
        Update: {
          article_url?: string | null
          created_at?: string | null
          id?: string
          influencer_name?: string | null
          message?: string | null
          platform?: string | null
          priority?: string | null
          run_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      influencer_registry: {
        Row: {
          active: boolean | null
          created_at: string | null
          email: string | null
          engagement_rate: number | null
          followers: number | null
          handle: string | null
          id: string
          location: string | null
          name: string | null
          platform: string | null
          topics: string[] | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          engagement_rate?: number | null
          followers?: number | null
          handle?: string | null
          id?: string
          location?: string | null
          name?: string | null
          platform?: string | null
          topics?: string[] | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          engagement_rate?: number | null
          followers?: number | null
          handle?: string | null
          id?: string
          location?: string | null
          name?: string | null
          platform?: string | null
          topics?: string[] | null
        }
        Relationships: []
      }
      lobstertrap_audit: {
        Row: {
          action_taken: string | null
          agent_key: string
          created_at: string
          error: string | null
          id: string
          injection_detected: boolean | null
          latency_ms: number | null
          model: string | null
          pii_detected: boolean | null
          pii_types: string[] | null
          prompt_preview: string | null
          prompt_tokens: number | null
          response_tokens: number | null
          risk_score: number | null
          run_id: string | null
          verdict: string | null
        }
        Insert: {
          action_taken?: string | null
          agent_key: string
          created_at?: string
          error?: string | null
          id?: string
          injection_detected?: boolean | null
          latency_ms?: number | null
          model?: string | null
          pii_detected?: boolean | null
          pii_types?: string[] | null
          prompt_preview?: string | null
          prompt_tokens?: number | null
          response_tokens?: number | null
          risk_score?: number | null
          run_id?: string | null
          verdict?: string | null
        }
        Update: {
          action_taken?: string | null
          agent_key?: string
          created_at?: string
          error?: string | null
          id?: string
          injection_detected?: boolean | null
          latency_ms?: number | null
          model?: string | null
          pii_detected?: boolean | null
          pii_types?: string[] | null
          prompt_preview?: string | null
          prompt_tokens?: number | null
          response_tokens?: number | null
          risk_score?: number | null
          run_id?: string | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lobstertrap_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_queue: {
        Row: {
          created_at: string | null
          html: string | null
          id: string
          run_id: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string | null
          html?: string | null
          id?: string
          run_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string | null
          html?: string | null
          id?: string
          run_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          read: boolean | null
          run_id: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          read?: boolean | null
          run_id?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          read?: boolean | null
          run_id?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      pipeline_health: {
        Row: {
          active_runs: number | null
          alerts_count: number | null
          auto_actions: number | null
          checked_at: string | null
          failed_runs: number | null
          healthy_runs: number | null
          id: string
          overall_status: string | null
          pending_approval: number | null
          report: Json | null
          stuck_runs: number | null
        }
        Insert: {
          active_runs?: number | null
          alerts_count?: number | null
          auto_actions?: number | null
          checked_at?: string | null
          failed_runs?: number | null
          healthy_runs?: number | null
          id?: string
          overall_status?: string | null
          pending_approval?: number | null
          report?: Json | null
          stuck_runs?: number | null
        }
        Update: {
          active_runs?: number | null
          alerts_count?: number | null
          auto_actions?: number | null
          checked_at?: string | null
          failed_runs?: number | null
          healthy_runs?: number | null
          id?: string
          overall_status?: string | null
          pending_approval?: number | null
          report?: Json | null
          stuck_runs?: number | null
        }
        Relationships: []
      }
      pipeline_runs: {
        Row: {
          agent_states: Json
          angle: string | null
          brand_voice: string
          brief: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          current_phase: string | null
          duration_ms: number | null
          enabled_agents: string[] | null
          error: string | null
          estimated_cost_usd: number
          finished_at: string | null
          id: string
          input_payload: Json
          input_type: string
          language: string
          mode: string | null
          model_overrides: Json | null
          priority: string | null
          started_at: string | null
          status: string
          target_audience: string | null
          topic: string
          total_agents: number | null
          total_tokens: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_states?: Json
          angle?: string | null
          brand_voice?: string
          brief?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          duration_ms?: number | null
          enabled_agents?: string[] | null
          error?: string | null
          estimated_cost_usd?: number
          finished_at?: string | null
          id?: string
          input_payload?: Json
          input_type?: string
          language?: string
          mode?: string | null
          model_overrides?: Json | null
          priority?: string | null
          started_at?: string | null
          status?: string
          target_audience?: string | null
          topic: string
          total_agents?: number | null
          total_tokens?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_states?: Json
          angle?: string | null
          brand_voice?: string
          brief?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          current_phase?: string | null
          duration_ms?: number | null
          enabled_agents?: string[] | null
          error?: string | null
          estimated_cost_usd?: number
          finished_at?: string | null
          id?: string
          input_payload?: Json
          input_type?: string
          language?: string
          mode?: string | null
          model_overrides?: Json | null
          priority?: string | null
          started_at?: string | null
          status?: string
          target_audience?: string | null
          topic?: string
          total_agents?: number | null
          total_tokens?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pipeline_runs_archive: {
        Row: {
          agent_states: Json
          archived_at: string | null
          brand_voice: string
          created_at: string
          current_phase: string | null
          duration_ms: number | null
          enabled_agents: string[] | null
          error: string | null
          estimated_cost_usd: number
          finished_at: string | null
          id: string
          input_payload: Json
          input_type: string
          language: string
          status: string
          topic: string
          total_tokens: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_states?: Json
          archived_at?: string | null
          brand_voice?: string
          created_at?: string
          current_phase?: string | null
          duration_ms?: number | null
          enabled_agents?: string[] | null
          error?: string | null
          estimated_cost_usd?: number
          finished_at?: string | null
          id?: string
          input_payload?: Json
          input_type?: string
          language?: string
          status?: string
          topic: string
          total_tokens?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_states?: Json
          archived_at?: string | null
          brand_voice?: string
          created_at?: string
          current_phase?: string | null
          duration_ms?: number | null
          enabled_agents?: string[] | null
          error?: string | null
          estimated_cost_usd?: number
          finished_at?: string | null
          id?: string
          input_payload?: Json
          input_type?: string
          language?: string
          status?: string
          topic?: string
          total_tokens?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraper_source_fb_pages: {
        Row: {
          created_at: string | null
          id: string
          page_id: string
          source_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          page_id: string
          source_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          page_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_source_fb_pages_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "facebook_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_source_fb_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scraper_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_sources: {
        Row: {
          auto_scrape: boolean | null
          category_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_scraped_at: string | null
          name: string
          scraping_method: string | null
          selectors: Json | null
          thumbnail_theme: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          auto_scrape?: boolean | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_scraped_at?: string | null
          name: string
          scraping_method?: string | null
          selectors?: Json | null
          thumbnail_theme?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          auto_scrape?: boolean | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_scraped_at?: string | null
          name?: string
          scraping_method?: string | null
          selectors?: Json | null
          thumbnail_theme?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_sources_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      social_queue: {
        Row: {
          content: Json | null
          created_at: string | null
          id: string
          platform: string | null
          run_id: string | null
          scheduled_for: string | null
          status: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          id?: string
          platform?: string | null
          run_id?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          id?: string
          platform?: string | null
          run_id?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          email: string
          id: string
          is_active: boolean
          subscribed_at: string
          user_id: string | null
        }
        Insert: {
          email: string
          id?: string
          is_active?: boolean
          subscribed_at?: string
          user_id?: string | null
        }
        Update: {
          email?: string
          id?: string
          is_active?: boolean
          subscribed_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      syndication_queue: {
        Row: {
          content: Json | null
          created_at: string | null
          id: string
          partner: string | null
          run_id: string | null
          status: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          id?: string
          partner?: string | null
          run_id?: string | null
          status?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          id?: string
          partner?: string | null
          run_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      system_health: {
        Row: {
          checked_at: string | null
          checks: Json | null
          critical_down: string[] | null
          degraded: string[] | null
          duration_ms: number | null
          id: string
          overall_status: string | null
          uptime_pct: number | null
        }
        Insert: {
          checked_at?: string | null
          checks?: Json | null
          critical_down?: string[] | null
          degraded?: string[] | null
          duration_ms?: number | null
          id?: string
          overall_status?: string | null
          uptime_pct?: number | null
        }
        Update: {
          checked_at?: string | null
          checks?: Json | null
          critical_down?: string[] | null
          degraded?: string[] | null
          duration_ms?: number | null
          id?: string
          overall_status?: string | null
          uptime_pct?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          created_at: string | null
          groups: Json | null
          id: string
          message: string | null
          run_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          groups?: Json | null
          id?: string
          message?: string | null
          run_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          groups?: Json | null
          id?: string
          message?: string | null
          run_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_view_count: { Args: { article_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
